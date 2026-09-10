import { createHash } from "node:crypto";
import { db } from "../db.js";
import { AppError } from "../errors.js";
import type { Handler } from "../types.js";
import {
  joinParticipation,
  leaveParticipation,
  normalizeParticipationState,
  type ParticipationState,
} from "./registration-domain.js";
import { createNotification } from "./notification.js";
import { findCurrentUser } from "./user.js";

type ActivityDocument = ParticipationState & {
  _id: string;
  status: string;
  registrationDeadline: Date | string;
  changeVersion?: number;
  organizerId: string;
  title?: string;
};

type RegistrationDocument = {
  _id: string;
  activityId: string;
  userId: string;
  nickname: string;
  status: string;
  queueNo: number;
  lastJoinKey?: string;
  lastLeaveKey?: string;
  processedActionKeys?: string[];
};

type CloudTransaction = Pick<typeof db, "collection">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, label: string, maxLength = 64): string {
  if (typeof value !== "string" || value.trim().length < 1 || value.trim().length > maxLength) {
    throw new AppError("INVALID_ARGUMENT", `${label}格式不正确`);
  }
  return value.trim();
}

function registrationId(activityId: string, userId: string): string {
  return createHash("sha256").update(`${activityId}:${userId}`).digest("hex").slice(0, 32);
}

function documentData<T>(snapshot: unknown): T | null {
  if (!isRecord(snapshot)) return null;
  const data = snapshot.data;
  if (Array.isArray(data)) return (data[0] as T | undefined) ?? null;
  return (data as T | undefined) ?? null;
}

function mapResult(status: string, state: ParticipationState, queueNo: number, userId: string) {
  const waitlistIndex = state.waitlistUserIds.indexOf(userId);
  return {
    status,
    queueNo,
    registeredCount: state.confirmedUserIds.length,
    waitlistCount: state.waitlistUserIds.length,
    waitlistPosition: waitlistIndex >= 0 ? waitlistIndex + 1 : null,
  };
}

function appendActionKey(current: RegistrationDocument | null, key: string): string[] {
  const keys = current?.processedActionKeys ?? [];
  return [...keys.filter((item) => item !== key), key].slice(-20);
}

export const joinRegistration: Handler = async (payload, context) => {
  if (!isRecord(payload)) throw new AppError("INVALID_ARGUMENT", "请提交有效的报名信息");
  const activityId = requiredString(payload.activityId, "球局编号");
  const idempotencyKey = requiredString(payload.idempotencyKey, "请求标识");
  const user = await findCurrentUser(context);
  if (user.status !== "ACTIVE") throw new AppError("ACCOUNT_RESTRICTED", "当前账号暂不能报名");
  if (!user.nickname) throw new AppError("PROFILE_REQUIRED", "请先设置昵称再报名");

  const result = await db.runTransaction(async (transaction: CloudTransaction) => {
    const activities = transaction.collection("activities");
    const registrations = transaction.collection("registrations");
    const participants = transaction.collection("participants");
    const activityRef = activities.doc(activityId);
    const registrationRef = registrations.doc(registrationId(activityId, user._id));
    const activity = documentData<ActivityDocument>(
      await activities.where({ _id: activityId }).limit(1).get(),
    );
    if (!activity) throw new AppError("ACTIVITY_NOT_FOUND", "球局不存在");
    if (activity.status !== "OPEN") throw new AppError("REGISTRATION_CLOSED", "该球局当前不可报名");
    if (new Date(activity.registrationDeadline).getTime() <= Date.now()) {
      throw new AppError("REGISTRATION_CLOSED", "该球局已截止报名");
    }

    const state = normalizeParticipationState(activity);
    const current = documentData<RegistrationDocument>(
      await registrations
        .where({ _id: registrationId(activityId, user._id) })
        .limit(1)
        .get(),
    );
    if (
      current?.lastJoinKey === idempotencyKey ||
      current?.processedActionKeys?.includes(idempotencyKey)
    ) {
      return { ...mapResult(current.status, state, current.queueNo, user._id), userId: user._id };
    }
    if (current?.status === "CONFIRMED" || current?.status === "WAITLISTED") {
      await registrationRef.update({
        data: { processedActionKeys: appendActionKey(current, idempotencyKey) },
      });
      const position = state.waitlistUserIds.indexOf(user._id);
      return {
        ...mapResult(current.status, state, current.queueNo, user._id),
        waitlistPosition: position >= 0 ? position + 1 : null,
        userId: user._id,
      };
    }

    const joined = joinParticipation(state, user._id);
    const now = db.serverDate();
    await activityRef.update({
      data: {
        confirmedUserIds: joined.state.confirmedUserIds,
        waitlistUserIds: joined.state.waitlistUserIds,
        registeredCount: joined.state.confirmedUserIds.length,
        waitlistCount: joined.state.waitlistUserIds.length,
        nextQueueNo: joined.state.nextQueueNo,
        updatedAt: now,
      },
    });
    await registrationRef.set({
      data: {
        activityId,
        userId: user._id,
        nickname: user.nickname,
        status: joined.status,
        queueNo: joined.queueNo,
        lastJoinKey: idempotencyKey,
        processedActionKeys: appendActionKey(current, idempotencyKey),
        joinedAt: now,
        statusChangedAt: now,
        acknowledgedChangeVersion: activity.changeVersion ?? 0,
        updatedAt: now,
        ...(current ? {} : { createdAt: now }),
      },
    });
    if (joined.status === "CONFIRMED") {
      await participants.doc(registrationId(activityId, user._id)).set({
        data: {
          activityId,
          userId: user._id,
          status: "ACTIVE",
          attendanceStatus: "PENDING",
          confirmedAt: now,
          updatedAt: now,
        },
      });
    }
    await createNotification(
      transaction,
      {
        userId: user._id,
        activityId,
        type: joined.status === "CONFIRMED" ? "REGISTRATION_CONFIRMED" : "REGISTRATION_WAITLISTED",
        title: joined.status === "CONFIRMED" ? "报名成功" : "已进入候补",
        body:
          joined.status === "CONFIRMED"
            ? `你已成功报名${activity.title ?? "该球局"}。`
            : `球局已满，你已进入候补队列。`,
        dedupeKey: `${activityId}:${joined.status}:${joined.queueNo}:${user._id}`,
      },
      now,
    );
    await transaction.collection("auditLogs").add({
      data: {
        actorId: user._id,
        action:
          joined.status === "CONFIRMED" ? "REGISTRATION_CONFIRMED" : "REGISTRATION_WAITLISTED",
        objectType: "REGISTRATION",
        objectId: registrationId(activityId, user._id),
        metadata: { activityId, queueNo: joined.queueNo },
        createdAt: now,
      },
    });
    const position = joined.state.waitlistUserIds.indexOf(user._id);
    return {
      ...mapResult(joined.status, joined.state, joined.queueNo, user._id),
      waitlistPosition: position >= 0 ? position + 1 : null,
      userId: user._id,
    };
  });
  return { registration: result };
};

export const leaveRegistration: Handler = async (payload, context) => {
  if (!isRecord(payload)) throw new AppError("INVALID_ARGUMENT", "请提交有效的退出信息");
  const activityId = requiredString(payload.activityId, "球局编号");
  const idempotencyKey = requiredString(payload.idempotencyKey, "请求标识");
  const user = await findCurrentUser(context);

  const result = await db.runTransaction(async (transaction: CloudTransaction) => {
    const activities = transaction.collection("activities");
    const activityRef = activities.doc(activityId);
    const registrations = transaction.collection("registrations");
    const participants = transaction.collection("participants");
    const registrationRef = registrations.doc(registrationId(activityId, user._id));
    const activity = documentData<ActivityDocument>(
      await activities.where({ _id: activityId }).limit(1).get(),
    );
    if (!activity) throw new AppError("ACTIVITY_NOT_FOUND", "球局不存在");
    const current = documentData<RegistrationDocument>(
      await registrations
        .where({ _id: registrationId(activityId, user._id) })
        .limit(1)
        .get(),
    );
    const state = normalizeParticipationState(activity);
    if (
      current?.lastLeaveKey === idempotencyKey ||
      current?.processedActionKeys?.includes(idempotencyKey)
    ) {
      return {
        status: current.status,
        registeredCount: state.confirmedUserIds.length,
        waitlistCount: state.waitlistUserIds.length,
        promotedUserId: null,
      };
    }
    if (!current) throw new AppError("REGISTRATION_NOT_ACTIVE", "当前没有可退出的报名");
    if (current.status === "WITHDRAWN") {
      await registrationRef.update({
        data: { processedActionKeys: appendActionKey(current, idempotencyKey) },
      });
      return {
        status: "WITHDRAWN",
        registeredCount: state.confirmedUserIds.length,
        waitlistCount: state.waitlistUserIds.length,
        promotedUserId: null,
      };
    }

    const allowPromotion = new Date(activity.registrationDeadline).getTime() > Date.now();
    const left = leaveParticipation(state, user._id, allowPromotion);
    const now = db.serverDate();
    await activityRef.update({
      data: {
        confirmedUserIds: left.state.confirmedUserIds,
        waitlistUserIds: left.state.waitlistUserIds,
        registeredCount: left.state.confirmedUserIds.length,
        waitlistCount: left.state.waitlistUserIds.length,
        updatedAt: now,
      },
    });
    await registrationRef.update({
      data: {
        status: "WITHDRAWN",
        lastLeaveKey: idempotencyKey,
        processedActionKeys: appendActionKey(current, idempotencyKey),
        statusChangedAt: now,
        updatedAt: now,
      },
    });
    if (left.previousStatus === "CONFIRMED") {
      await participants.doc(registrationId(activityId, user._id)).set({
        data: {
          activityId,
          userId: user._id,
          status: "WITHDRAWN",
          withdrawnAt: now,
          updatedAt: now,
        },
      });
    }
    if (left.promotedUserId) {
      await registrations.doc(registrationId(activityId, left.promotedUserId)).update({
        data: { status: "CONFIRMED", promotedAt: now, statusChangedAt: now, updatedAt: now },
      });
      await participants.doc(registrationId(activityId, left.promotedUserId)).set({
        data: {
          activityId,
          userId: left.promotedUserId,
          status: "ACTIVE",
          attendanceStatus: "PENDING",
          confirmedAt: now,
          updatedAt: now,
        },
      });
      await createNotification(
        transaction,
        {
          userId: left.promotedUserId,
          activityId,
          type: "REGISTRATION_PROMOTED",
          title: "候补已递补",
          body: `你已递补为${activity.title ?? "该球局"}的正式成员。`,
          dedupeKey: `${activityId}:REGISTRATION_PROMOTED:${left.promotedUserId}`,
        },
        now,
      );
      await transaction.collection("auditLogs").add({
        data: {
          actorId: user._id,
          action: "REGISTRATION_PROMOTED",
          objectType: "REGISTRATION",
          objectId: registrationId(activityId, left.promotedUserId),
          metadata: { activityId, reason: "CONFIRMED_MEMBER_LEFT_BEFORE_DEADLINE" },
          createdAt: now,
        },
      });
    }
    if (left.previousStatus === "CONFIRMED" && !allowPromotion) {
      await createNotification(
        transaction,
        {
          userId: activity.organizerId,
          activityId,
          type: "MEMBER_LEFT_AFTER_DEADLINE",
          title: "成员在截止后退出",
          body: `${user.nickname ?? "一名成员"}已退出，请人工确认是否补入候补。`,
          dedupeKey: `${activityId}:MEMBER_LEFT_AFTER_DEADLINE:${user._id}:${idempotencyKey}`,
        },
        now,
      );
    }
    await transaction.collection("auditLogs").add({
      data: {
        actorId: user._id,
        action: "REGISTRATION_WITHDRAWN",
        objectType: "REGISTRATION",
        objectId: registrationId(activityId, user._id),
        metadata: { activityId, previousStatus: left.previousStatus },
        createdAt: now,
      },
    });
    return {
      status: "WITHDRAWN",
      registeredCount: left.state.confirmedUserIds.length,
      waitlistCount: left.state.waitlistUserIds.length,
      promotedUserId: left.promotedUserId,
    };
  });
  return { registration: result };
};

export const promoteWaitlistedRegistration: Handler = async (payload, context) => {
  if (!isRecord(payload)) throw new AppError("INVALID_ARGUMENT", "请提交有效的递补信息");
  const activityId = requiredString(payload.activityId, "球局编号");
  const targetUserId = requiredString(payload.userId, "用户编号");
  const organizer = await findCurrentUser(context);
  const result = await db.runTransaction(async (transaction: CloudTransaction) => {
    const activities = transaction.collection("activities");
    const registrations = transaction.collection("registrations");
    const activity = documentData<ActivityDocument>(
      await activities.where({ _id: activityId }).limit(1).get(),
    );
    if (!activity) throw new AppError("ACTIVITY_NOT_FOUND", "球局不存在");
    if (activity.organizerId !== organizer._id) {
      throw new AppError("FORBIDDEN", "只有组织者可以手动递补");
    }
    if (activity.status !== "OPEN") throw new AppError("INVALID_STATE", "当前状态不能递补");
    if (new Date(activity.registrationDeadline).getTime() > Date.now()) {
      throw new AppError("INVALID_STATE", "报名截止前由系统自动递补");
    }
    const state = normalizeParticipationState(activity);
    if (state.confirmedUserIds.length >= state.capacity) {
      throw new AppError("CAPACITY_FULL", "当前没有空余名额");
    }
    if (!state.waitlistUserIds.includes(targetUserId)) {
      throw new AppError("REGISTRATION_NOT_ACTIVE", "该用户当前不在候补中");
    }
    const confirmedUserIds = [...state.confirmedUserIds, targetUserId];
    const waitlistUserIds = state.waitlistUserIds.filter((id) => id !== targetUserId);
    const now = db.serverDate();
    await activities.doc(activityId).update({
      data: {
        confirmedUserIds,
        waitlistUserIds,
        registeredCount: confirmedUserIds.length,
        waitlistCount: waitlistUserIds.length,
        updatedAt: now,
      },
    });
    await registrations.doc(registrationId(activityId, targetUserId)).update({
      data: {
        status: "CONFIRMED",
        promotedAt: now,
        promotedBy: organizer._id,
        acknowledgedChangeVersion: activity.changeVersion ?? 0,
        statusChangedAt: now,
        updatedAt: now,
      },
    });
    await transaction
      .collection("participants")
      .doc(registrationId(activityId, targetUserId))
      .set({
        data: {
          activityId,
          userId: targetUserId,
          status: "ACTIVE",
          attendanceStatus: "PENDING",
          confirmedAt: now,
          updatedAt: now,
        },
      });
    await createNotification(
      transaction,
      {
        userId: targetUserId,
        activityId,
        type: "REGISTRATION_PROMOTED",
        title: "候补已递补",
        body: `组织者已将你补入${activity.title ?? "该球局"}。`,
        dedupeKey: `${activityId}:MANUAL_PROMOTION:${targetUserId}`,
      },
      now,
    );
    await transaction.collection("auditLogs").add({
      data: {
        actorId: organizer._id,
        action: "REGISTRATION_MANUALLY_PROMOTED",
        objectType: "REGISTRATION",
        objectId: registrationId(activityId, targetUserId),
        metadata: { activityId },
        createdAt: now,
      },
    });
    return {
      status: "CONFIRMED",
      registeredCount: confirmedUserIds.length,
      waitlistCount: waitlistUserIds.length,
    };
  });
  return { registration: result };
};
