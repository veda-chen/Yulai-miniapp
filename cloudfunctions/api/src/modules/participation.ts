import { createHash } from "node:crypto";
import { db } from "../db.js";
import { AppError } from "../errors.js";
import type { Handler } from "../types.js";
import { createNotification } from "./notification.js";
import { findCurrentUser } from "./user.js";

const ATTENDANCE_STATUSES = new Set(["PENDING", "CHECKED_IN", "ABSENT", "LEFT"]);
type CloudTransaction = Pick<typeof db, "collection">;
type ActivityDocument = {
  _id: string;
  organizerId: string;
  title: string;
  status: string;
  version: number;
  confirmedUserIds?: string[];
  waitlistUserIds?: string[];
};
type ParticipantDocument = {
  userId: string;
  status: string;
  attendanceStatus?: string;
  checkedInAt?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredId(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 64) {
    throw new AppError("INVALID_ARGUMENT", `${label}无效`);
  }
  return value;
}

function participantId(activityId: string, userId: string): string {
  return createHash("sha256").update(`${activityId}:${userId}`).digest("hex").slice(0, 32);
}

function documentData<T>(snapshot: unknown): T | null {
  if (!isRecord(snapshot)) return null;
  const data = snapshot.data;
  if (Array.isArray(data)) return (data[0] as T | undefined) ?? null;
  return (data as T | undefined) ?? null;
}

function documentList<T>(snapshot: unknown): T[] {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.data)) return [];
  return snapshot.data as T[];
}

async function getActivity(id: string): Promise<ActivityDocument> {
  const result = (await db
    .collection("activities")
    .where({ _id: id })
    .limit(1)
    .get()) as unknown as {
    data: ActivityDocument[];
  };
  const activity = result.data[0];
  if (!activity) throw new AppError("ACTIVITY_NOT_FOUND", "球局不存在");
  return activity;
}

export const listParticipants: Handler = async (payload, context) => {
  const id = requiredId(isRecord(payload) ? payload.id : null, "球局编号");
  const user = await findCurrentUser(context);
  const activity = await getActivity(id);
  const canView =
    activity.organizerId === user._id || (activity.confirmedUserIds ?? []).includes(user._id);
  if (!canView) throw new AppError("FORBIDDEN", "只有组织者和正式成员可以查看到场信息");
  const result = (await db
    .collection("participants")
    .where({ activityId: id })
    .limit(100)
    .get()) as unknown as {
    data: ParticipantDocument[];
  };
  const userIds = [
    ...new Set([...result.data.map((item) => item.userId), ...(activity.waitlistUserIds ?? [])]),
  ];
  const users = userIds.length
    ? (
        (await db
          .collection("users")
          .where({ _id: db.command.in(userIds) })
          .limit(100)
          .get()) as unknown as { data: Array<{ _id: string; nickname: string | null }> }
      ).data
    : [];
  const names = new Map(users.map((item) => [item._id, item.nickname ?? "球友"]));
  return {
    participants: result.data.map((item) => ({
      userId: item.userId,
      nickname: names.get(item.userId) ?? "球友",
      attendanceStatus: item.attendanceStatus ?? "PENDING",
      status: item.status,
    })),
    waitlist: (activity.waitlistUserIds ?? []).map((userId, index) => ({
      userId,
      nickname: names.get(userId) ?? "球友",
      position: index + 1,
    })),
    canManage: activity.organizerId === user._id,
  };
};

export const startActivity: Handler = async (payload, context) => {
  const id = requiredId(isRecord(payload) ? payload.id : null, "球局编号");
  const user = await findCurrentUser(context);
  const activity = await getActivity(id);
  if (activity.organizerId !== user._id) throw new AppError("FORBIDDEN", "只有组织者可以开始球局");
  if (activity.status === "IN_PROGRESS") return { activity: { id, status: "IN_PROGRESS" } };
  if (activity.status !== "OPEN") throw new AppError("INVALID_STATE", "当前状态不能开始球局");
  await db
    .collection("activities")
    .doc(id)
    .update({
      data: {
        status: "IN_PROGRESS",
        startedAt: db.serverDate(),
        version: db.command.inc(1),
        updatedAt: db.serverDate(),
      },
    });
  await db.collection("auditLogs").add({
    data: {
      actorId: user._id,
      action: "ACTIVITY_STARTED",
      objectType: "ACTIVITY",
      objectId: id,
      metadata: {},
      createdAt: db.serverDate(),
    },
  });
  return { activity: { id, status: "IN_PROGRESS" } };
};

export const setAttendance: Handler = async (payload, context) => {
  if (!isRecord(payload)) throw new AppError("INVALID_ARGUMENT", "请提交有效的到场状态");
  const activityId = requiredId(payload.activityId, "球局编号");
  const userId = requiredId(payload.userId, "用户编号");
  const attendanceStatus =
    typeof payload.attendanceStatus === "string" ? payload.attendanceStatus : "";
  if (!ATTENDANCE_STATUSES.has(attendanceStatus))
    throw new AppError("INVALID_ARGUMENT", "到场状态无效");
  const user = await findCurrentUser(context);
  const activity = await getActivity(activityId);
  if (activity.organizerId !== user._id) throw new AppError("FORBIDDEN", "只有组织者可以确认到场");
  if (!(activity.confirmedUserIds ?? []).includes(userId))
    throw new AppError("PARTICIPANT_NOT_FOUND", "该用户不是正式成员");
  if (
    activity.status === "CANCELLED" ||
    activity.status === "ENDED" ||
    activity.status === "HIDDEN"
  ) {
    throw new AppError("INVALID_STATE", "当前状态不能修改到场信息");
  }
  const now = db.serverDate();
  await db
    .collection("participants")
    .doc(participantId(activityId, userId))
    .set({
      data: {
        activityId,
        userId,
        status: "ACTIVE",
        attendanceStatus,
        ...(attendanceStatus === "CHECKED_IN" ? { checkedInAt: now } : {}),
        updatedAt: now,
      },
    });
  await db.collection("auditLogs").add({
    data: {
      actorId: user._id,
      action: "ATTENDANCE_UPDATED",
      objectType: "PARTICIPANT",
      objectId: participantId(activityId, userId),
      metadata: { attendanceStatus },
      createdAt: now,
    },
  });
  return { participant: { userId, attendanceStatus } };
};

export const finishActivity: Handler = async (payload, context) => {
  const id = requiredId(isRecord(payload) ? payload.id : null, "球局编号");
  const user = await findCurrentUser(context);
  const result = await db.runTransaction(async (transaction: CloudTransaction) => {
    const activities = transaction.collection("activities");
    const activity = documentData<ActivityDocument>(
      await activities.where({ _id: id }).limit(1).get(),
    );
    if (!activity) throw new AppError("ACTIVITY_NOT_FOUND", "球局不存在");
    if (activity.organizerId !== user._id)
      throw new AppError("FORBIDDEN", "只有组织者可以结束球局");
    if (activity.status === "ENDED") return { status: "ENDED" };
    if (activity.status !== "OPEN" && activity.status !== "IN_PROGRESS")
      throw new AppError("INVALID_STATE", "当前状态不能结束球局");
    const now = db.serverDate();
    const participants = transaction.collection("participants");
    const registrations = transaction.collection("registrations");
    for (const userId of activity.confirmedUserIds ?? []) {
      const participant = documentData<ParticipantDocument>(
        await participants
          .where({ _id: participantId(id, userId) })
          .limit(1)
          .get(),
      );
      const attended = participant?.attendanceStatus === "CHECKED_IN";
      await participants.doc(participantId(id, userId)).set({
        data: {
          activityId: id,
          userId,
          status: "COMPLETED",
          attendanceStatus: attended ? "CHECKED_IN" : "ABSENT",
          completedAt: now,
          updatedAt: now,
        },
      });
      await registrations.where({ activityId: id, userId }).update({
        data: { status: attended ? "ATTENDED" : "NO_SHOW", statusChangedAt: now, updatedAt: now },
      });
      await createNotification(
        transaction,
        {
          userId,
          activityId: id,
          type: "ACTIVITY_ENDED",
          title: "球局已结束",
          body: `${activity.title}已结束，参与记录已保存。`,
          dedupeKey: `${id}:ACTIVITY_ENDED:${userId}`,
        },
        now,
      );
    }
    const matchSnapshot = documentList<{ _id: string; status: string }>(
      await transaction.collection("matches").where({ activityId: id }).limit(100).get(),
    );
    for (const match of matchSnapshot) {
      if (match.status === "LOCKED") continue;
      await transaction
        .collection("matches")
        .doc(match._id)
        .update({ data: { status: "VOID", updatedAt: now } });
      await transaction
        .collection("matchPlayers")
        .where({ matchId: match._id })
        .update({ data: { result: "VOID", updatedAt: now } });
    }
    await transaction
      .collection("rounds")
      .where({ activityId: id })
      .update({ data: { status: "COMPLETED", updatedAt: now } });
    await activities.doc(id).update({
      data: { status: "ENDED", endedAt: now, version: activity.version + 1, updatedAt: now },
    });
    await transaction.collection("auditLogs").add({
      data: {
        actorId: user._id,
        action: "ACTIVITY_ENDED",
        objectType: "ACTIVITY",
        objectId: id,
        metadata: {},
        createdAt: now,
      },
    });
    return { status: "ENDED" };
  });
  return { activity: { id, ...result } };
};
