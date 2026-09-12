import { createHash } from "node:crypto";
import { db } from "../db.js";
import { AppError } from "../errors.js";
import type { Handler, RequestContext } from "../types.js";
import { createNotification } from "./notification.js";
import { findCurrentUser } from "./user.js";

const VISIBILITIES = new Set(["PUBLIC", "LINK_ONLY"]);
const CONTACT_VISIBILITIES = new Set(["NONE", "PARTICIPANTS", "PUBLIC"]);
const LEVELS = new Set(["ANY", "CASUAL", "BEGINNER", "IMPROVING", "COMPETITIVE"]);
const DATE_FIELDS = new Set(["startAt", "endAt", "registrationDeadline"]);
const CRITICAL_FIELDS = [
  "startAt",
  "endAt",
  "registrationDeadline",
  "venueId",
  "locationHint",
  "capacity",
] as const;
const SHANGHAI_OFFSET = 8 * 60 * 60 * 1000;

type ActivityInput = {
  venueId: string;
  title: string | null;
  startAt: Date;
  endAt: Date;
  registrationDeadline: Date;
  capacity: number;
  level: string;
  locationHint: string | null;
  feeNote: string | null;
  contact: string | null;
  contactVisibility: string;
  details: string | null;
  visibility: string;
  groupingEnabled: boolean;
  scoringEnabled: boolean;
};

type ActivityDocument = ActivityInput & {
  _id: string;
  organizerId: string;
  organizerName: string;
  venueName: string;
  status: string;
  registeredCount: number;
  waitlistCount?: number;
  confirmedUserIds?: string[];
  waitlistUserIds?: string[];
  nextQueueNo?: number;
  changeVersion?: number;
  cancelReason?: string;
  cancelledAt?: unknown;
  idempotencyKey: string;
  version: number;
  createdAt: unknown;
  updatedAt: unknown;
};

type VenueDocument = { _id: string; name: string; status: string };

type RegistrationDocument = {
  userId: string;
  nickname: string;
  status: string;
  queueNo: number;
  acknowledgedChangeVersion?: number;
};

type RosterMember = Pick<RegistrationDocument, "nickname" | "status" | "queueNo">;
type CloudTransaction = Pick<typeof db, "collection">;

type ActivityChangeDocument = {
  _id: string;
  version: number;
  changedFields: string[];
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  createdAt: Date | string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim().length < 1 || value.trim().length > maxLength) {
    throw new AppError("INVALID_ARGUMENT", `${label}格式不正确`);
  }
  return value.trim();
}

function optionalString(value: unknown, label: string, maxLength: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > maxLength) {
    throw new AppError("INVALID_ARGUMENT", `${label}格式不正确`);
  }
  return value.trim() || null;
}

function requiredDate(value: unknown, label: string): Date {
  if (typeof value !== "string") throw new AppError("INVALID_ARGUMENT", `${label}格式不正确`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new AppError("INVALID_ARGUMENT", `${label}格式不正确`);
  return date;
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

function stableId(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export function parseActivityInput(payload: unknown, now = new Date()): ActivityInput {
  if (!isRecord(payload)) throw new AppError("INVALID_ARGUMENT", "请提交有效的球局信息");

  const startAt = requiredDate(payload.startAt, "开始时间");
  const endAt = requiredDate(payload.endAt, "结束时间");
  const registrationDeadline = requiredDate(payload.registrationDeadline, "报名截止时间");
  if (startAt.getTime() <= now.getTime()) {
    throw new AppError("INVALID_ARGUMENT", "开始时间必须晚于当前时间");
  }
  if (endAt.getTime() <= startAt.getTime()) {
    throw new AppError("INVALID_ARGUMENT", "结束时间必须晚于开始时间");
  }
  if (registrationDeadline.getTime() > startAt.getTime()) {
    throw new AppError("INVALID_ARGUMENT", "报名截止时间不能晚于开始时间");
  }
  if (registrationDeadline.getTime() <= now.getTime()) {
    throw new AppError("INVALID_ARGUMENT", "报名截止时间必须晚于当前时间");
  }

  if (
    !Number.isInteger(payload.capacity) ||
    Number(payload.capacity) < 4 ||
    Number(payload.capacity) > 40
  ) {
    throw new AppError("INVALID_ARGUMENT", "人数上限需为4至40人");
  }
  const visibility = payload.visibility ?? "PUBLIC";
  const contactVisibility = payload.contactVisibility ?? "PARTICIPANTS";
  const level = payload.level ?? "ANY";
  if (typeof visibility !== "string" || !VISIBILITIES.has(visibility)) {
    throw new AppError("INVALID_ARGUMENT", "可见范围无效");
  }
  if (typeof contactVisibility !== "string" || !CONTACT_VISIBILITIES.has(contactVisibility)) {
    throw new AppError("INVALID_ARGUMENT", "联系方式可见范围无效");
  }
  if (typeof level !== "string" || !LEVELS.has(level)) {
    throw new AppError("INVALID_ARGUMENT", "水平要求无效");
  }

  return {
    venueId: requiredString(payload.venueId, "场馆", 64),
    title: optionalString(payload.title, "标题", 60),
    startAt,
    endAt,
    registrationDeadline,
    capacity: Number(payload.capacity),
    level,
    locationHint: optionalString(payload.locationHint, "场号或位置", 100),
    feeNote: optionalString(payload.feeNote, "费用说明", 200),
    contact: optionalString(payload.contact, "联系方式", 100),
    contactVisibility,
    details: optionalString(payload.details, "详细说明", 1000),
    visibility,
    groupingEnabled: payload.groupingEnabled === true,
    scoringEnabled: payload.scoringEnabled === true,
  };
}

function toIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return new Date(value).toISOString();
  return null;
}

function defaultTitle(startAt: Date, venueName: string): string {
  const chinaTime = new Date(startAt.getTime() + SHANGHAI_OFFSET);
  return `${chinaTime.getUTCMonth() + 1}月${chinaTime.getUTCDate()}日 ${venueName}羽毛球局`;
}

export function criticalChangedFields(
  current: Record<string, unknown>,
  next: Record<string, unknown>,
): string[] {
  return CRITICAL_FIELDS.filter((field) =>
    DATE_FIELDS.has(field)
      ? toIso(current[field]) !== toIso(next[field])
      : current[field] !== next[field],
  );
}

function mapActivity(
  activity: ActivityDocument,
  options: { includeContact: boolean; isOrganizer: boolean },
) {
  return {
    id: activity._id,
    title: activity.title,
    venue: { id: activity.venueId, name: activity.venueName },
    organizer: { id: activity.organizerId, nickname: activity.organizerName },
    startAt: toIso(activity.startAt),
    endAt: toIso(activity.endAt),
    registrationDeadline: toIso(activity.registrationDeadline),
    capacity: activity.capacity,
    registeredCount: activity.registeredCount,
    waitlistCount: activity.waitlistCount ?? 0,
    level: activity.level,
    locationHint: activity.locationHint,
    feeNote: activity.feeNote,
    contact: options.includeContact ? activity.contact : null,
    contactVisibility: activity.contactVisibility,
    details: activity.details,
    visibility: activity.visibility,
    groupingEnabled: activity.groupingEnabled,
    scoringEnabled: activity.scoringEnabled,
    status: activity.status,
    version: activity.version,
    changeVersion: activity.changeVersion ?? 0,
    cancelReason: activity.cancelReason ?? null,
    cancelledAt: toIso(activity.cancelledAt),
    isOrganizer: options.isOrganizer,
  };
}

async function getVenue(id: string): Promise<VenueDocument> {
  const result = (await db
    .collection("venues")
    .where({ _id: id, status: db.command.in(["ACTIVE", "PENDING_VERIFICATION"]) })
    .limit(1)
    .get()) as unknown as { data: VenueDocument[] };
  const venue = result.data[0];
  if (!venue) throw new AppError("VENUE_NOT_FOUND", "所选场馆不存在或暂不可用");
  return venue;
}

async function optionalCurrentUser(context: RequestContext) {
  if (!context.openid) return null;
  try {
    return await findCurrentUser(context);
  } catch {
    return null;
  }
}

export const listActivities: Handler = async (_payload, context) => {
  const result = (await db
    .collection("activities")
    .where({ status: "OPEN", visibility: "PUBLIC", startAt: db.command.gt(new Date()) })
    .orderBy("startAt", "asc")
    .limit(50)
    .get()) as unknown as { data: ActivityDocument[] };
  const user = await optionalCurrentUser(context);
  const registrationByActivity = new Map<string, string>();
  if (user && result.data.length > 0) {
    const registrations = (await db
      .collection("registrations")
      .where({
        userId: user._id,
        activityId: db.command.in(result.data.map((activity) => activity._id)),
      })
      .limit(50)
      .get()) as unknown as { data: Array<RegistrationDocument & { activityId: string }> };
    for (const registration of registrations.data) {
      registrationByActivity.set(registration.activityId, registration.status);
    }
  }
  return {
    activities: result.data.map((activity) => ({
      ...mapActivity(activity, {
        includeContact: activity.contactVisibility === "PUBLIC",
        isOrganizer: user?._id === activity.organizerId,
      }),
      currentRegistrationStatus: registrationByActivity.get(activity._id) ?? null,
    })),
  };
};

export const getActivity: Handler = async (payload, context) => {
  const id = isRecord(payload) ? payload.id : null;
  if (typeof id !== "string" || id.length < 1 || id.length > 64) {
    throw new AppError("INVALID_ARGUMENT", "球局编号无效");
  }
  const result = (await db
    .collection("activities")
    .where({ _id: id })
    .limit(1)
    .get()) as unknown as {
    data: ActivityDocument[];
  };
  const activity = result.data[0];
  if (!activity) throw new AppError("ACTIVITY_NOT_FOUND", "球局不存在");
  const user = await optionalCurrentUser(context);
  const isOrganizer = user?._id === activity.organizerId;
  if (activity.status === "HIDDEN" && !isOrganizer && user?.role !== "ADMIN") {
    throw new AppError("ACTIVITY_NOT_FOUND", "球局不存在");
  }
  let currentRegistration: RegistrationDocument | null = null;
  if (user) {
    const current = (await db
      .collection("registrations")
      .where({ activityId: activity._id, userId: user._id })
      .limit(1)
      .get()) as unknown as { data: RegistrationDocument[] };
    currentRegistration = current.data[0] ?? null;
  }
  const isParticipant = ["CONFIRMED", "ATTENDED", "NO_SHOW"].includes(
    currentRegistration?.status ?? "",
  );
  const canViewRoster = isOrganizer || isParticipant;
  let roster: { confirmed: RosterMember[]; waitlist: RosterMember[] } | null = null;
  let changeConfirmation: { acknowledged: number; pending: number } | null = null;
  if (canViewRoster) {
    const registrations = (await db
      .collection("registrations")
      .where({
        activityId: activity._id,
        status: db.command.in(["CONFIRMED", "WAITLISTED", "ATTENDED", "NO_SHOW"]),
      })
      .orderBy("queueNo", "asc")
      .limit(100)
      .get()) as unknown as { data: RegistrationDocument[] };
    const mapMember = (registration: RegistrationDocument) => ({
      nickname: registration.nickname,
      status: registration.status,
      queueNo: registration.queueNo,
    });
    roster = {
      confirmed: registrations.data.filter((item) => item.status !== "WAITLISTED").map(mapMember),
      waitlist: registrations.data.filter((item) => item.status === "WAITLISTED").map(mapMember),
    };
    const currentChangeVersion = activity.changeVersion ?? 0;
    const confirmed = registrations.data.filter((item) => item.status === "CONFIRMED");
    changeConfirmation = {
      acknowledged: confirmed.filter(
        (item) => (item.acknowledgedChangeVersion ?? 0) >= currentChangeVersion,
      ).length,
      pending: confirmed.filter(
        (item) => (item.acknowledgedChangeVersion ?? 0) < currentChangeVersion,
      ).length,
    };
  }
  const waitlistPosition =
    currentRegistration?.status === "WAITLISTED"
      ? (activity.waitlistUserIds ?? []).indexOf(user?._id ?? "") + 1
      : null;
  const changes = (await db
    .collection("activityChanges")
    .where({ activityId: activity._id })
    .orderBy("version", "desc")
    .limit(10)
    .get()) as unknown as { data: ActivityChangeDocument[] };
  const changeVersion = activity.changeVersion ?? 0;
  return {
    activity: mapActivity(activity, {
      isOrganizer,
      includeContact: isOrganizer || isParticipant || activity.contactVisibility === "PUBLIC",
    }),
    currentRegistration: currentRegistration
      ? {
          status: currentRegistration.status,
          queueNo: currentRegistration.queueNo,
          waitlistPosition: waitlistPosition && waitlistPosition > 0 ? waitlistPosition : null,
          acknowledgedChangeVersion: currentRegistration.acknowledgedChangeVersion ?? 0,
          hasPendingChange:
            currentRegistration.status === "CONFIRMED" &&
            (currentRegistration.acknowledgedChangeVersion ?? 0) < changeVersion,
        }
      : null,
    roster,
    changeConfirmation,
    changes: changes.data.map((change) => ({
      id: change._id,
      version: change.version,
      changedFields: change.changedFields,
      before: change.before,
      after: change.after,
      createdAt: toIso(change.createdAt),
    })),
  };
};

export const createActivity: Handler = async (payload, context) => {
  if (!isRecord(payload)) throw new AppError("INVALID_ARGUMENT", "请提交有效的球局信息");
  const user = await findCurrentUser(context);
  if (user.status !== "ACTIVE") throw new AppError("ACCOUNT_RESTRICTED", "当前账号暂不能创建球局");
  if (!user.nickname) throw new AppError("PROFILE_REQUIRED", "请先设置昵称再创建球局");
  const idempotencyKey = requiredString(payload.idempotencyKey, "请求标识", 64);
  const input = parseActivityInput(payload);
  const venue = await getVenue(input.venueId);
  const title = input.title ?? defaultTitle(input.startAt, venue.name);
  const activityId = stableId(`activity:${user._id}:${idempotencyKey}`);
  const organizerRegistrationId = stableId(`${activityId}:${user._id}`);
  const activity = await db.runTransaction(async (transaction: CloudTransaction) => {
    const activities = transaction.collection("activities");
    const existing = documentData<ActivityDocument>(
      await activities.where({ organizerId: user._id, idempotencyKey }).limit(1).get(),
    );
    if (existing) return existing;

    const now = db.serverDate();
    const document = {
      ...input,
      title,
      organizerId: user._id,
      organizerName: user.nickname,
      venueName: venue.name,
      status: "OPEN",
      registeredCount: 1,
      waitlistCount: 0,
      confirmedUserIds: [user._id],
      waitlistUserIds: [],
      nextQueueNo: 2,
      changeVersion: 0,
      idempotencyKey,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    await activities.doc(activityId).set({ data: document });
    await transaction
      .collection("registrations")
      .doc(organizerRegistrationId)
      .set({
        data: {
          activityId,
          userId: user._id,
          nickname: user.nickname,
          status: "CONFIRMED",
          queueNo: 1,
          joinedAt: now,
          statusChangedAt: now,
          acknowledgedChangeVersion: 0,
          createdAt: now,
          updatedAt: now,
        },
      });
    await transaction
      .collection("participants")
      .doc(organizerRegistrationId)
      .set({
        data: {
          activityId,
          userId: user._id,
          status: "ACTIVE",
          attendanceStatus: "PENDING",
          confirmedAt: now,
          createdAt: now,
          updatedAt: now,
        },
      });
    return { ...document, _id: activityId } as ActivityDocument;
  });
  return { activity: mapActivity(activity, { includeContact: true, isOrganizer: true }) };
};

export const updateActivity: Handler = async (payload, context) => {
  if (!isRecord(payload)) throw new AppError("INVALID_ARGUMENT", "请提交有效的球局信息");
  const id = requiredString(payload.id, "球局编号", 64);
  if (!Number.isInteger(payload.version) || Number(payload.version) < 1) {
    throw new AppError("INVALID_ARGUMENT", "球局版本无效");
  }
  const user = await findCurrentUser(context);
  const result = (await db
    .collection("activities")
    .where({ _id: id })
    .limit(1)
    .get()) as unknown as {
    data: ActivityDocument[];
  };
  const current = result.data[0];
  if (!current) throw new AppError("ACTIVITY_NOT_FOUND", "球局不存在");
  if (current.organizerId !== user._id) throw new AppError("FORBIDDEN", "只有组织者可以修改球局");
  if (current.status !== "OPEN") throw new AppError("INVALID_STATE", "当前状态不能修改球局");

  const input = parseActivityInput(payload);
  if (input.capacity < current.registeredCount) {
    throw new AppError("CAPACITY_TOO_SMALL", "人数上限不能低于当前报名人数");
  }
  const venue = await getVenue(input.venueId);
  const title = input.title ?? defaultTitle(input.startAt, venue.name);
  const next = { ...input, title, venueName: venue.name };
  const changedFields = criticalChangedFields(current, next);
  const nextVersion = Number(payload.version) + 1;
  const nextChangeVersion = (current.changeVersion ?? 0) + (changedFields.length > 0 ? 1 : 0);
  await db.runTransaction(async (transaction: CloudTransaction) => {
    const activities = transaction.collection("activities");
    const fresh = documentData<ActivityDocument>(
      await activities.where({ _id: id }).limit(1).get(),
    );
    if (!fresh) throw new AppError("ACTIVITY_NOT_FOUND", "球局不存在");
    if (fresh.organizerId !== user._id) throw new AppError("FORBIDDEN", "只有组织者可以修改球局");
    if (fresh.version !== Number(payload.version)) {
      throw new AppError("VERSION_CONFLICT", "球局已被更新，请刷新后重试");
    }
    const now = db.serverDate();
    await activities.doc(id).update({
      data: { ...next, version: nextVersion, changeVersion: nextChangeVersion, updatedAt: now },
    });
    if (changedFields.length === 0) return;

    const before = Object.fromEntries(
      changedFields.map((field) => [field, Reflect.get(fresh, field)]),
    );
    const after = Object.fromEntries(
      changedFields.map((field) => [field, Reflect.get(next, field)]),
    );
    await transaction
      .collection("activityChanges")
      .doc(stableId(`${id}:${nextChangeVersion}`))
      .set({
        data: {
          activityId: id,
          version: nextChangeVersion,
          changedBy: user._id,
          changedFields,
          before,
          after,
          createdAt: now,
        },
      });
    if ((fresh.confirmedUserIds ?? []).includes(user._id)) {
      await transaction
        .collection("registrations")
        .doc(stableId(`${id}:${user._id}`))
        .update({
          data: {
            acknowledgedChangeVersion: nextChangeVersion,
            acknowledgedAt: now,
            updatedAt: now,
          },
        });
    }
    for (const userId of (fresh.confirmedUserIds ?? []).filter((id) => id !== user._id)) {
      await createNotification(
        transaction,
        {
          userId,
          activityId: id,
          type: "ACTIVITY_CHANGED",
          title: "球局信息有重要变更",
          body: `${title}的重要信息已更新，请查看并确认。`,
          dedupeKey: `${id}:ACTIVITY_CHANGED:${nextChangeVersion}:${userId}`,
        },
        now,
      );
    }
    await transaction.collection("auditLogs").add({
      data: {
        actorId: user._id,
        action: "ACTIVITY_UPDATED",
        objectType: "ACTIVITY",
        objectId: id,
        metadata: { changedFields, changeVersion: nextChangeVersion },
        createdAt: now,
      },
    });
  });

  return {
    activity: mapActivity(
      {
        ...current,
        ...next,
        version: nextVersion,
        changeVersion: nextChangeVersion,
      } as ActivityDocument,
      { includeContact: true, isOrganizer: true },
    ),
  };
};

export const acknowledgeActivityChange: Handler = async (payload, context) => {
  if (!isRecord(payload)) throw new AppError("INVALID_ARGUMENT", "请提交有效的确认信息");
  const id = requiredString(payload.id, "球局编号", 64);
  const user = await findCurrentUser(context);
  const activityResult = (await db
    .collection("activities")
    .where({ _id: id })
    .limit(1)
    .get()) as unknown as { data: ActivityDocument[] };
  const activity = activityResult.data[0];
  if (!activity) throw new AppError("ACTIVITY_NOT_FOUND", "球局不存在");
  const changeVersion = activity.changeVersion ?? 0;
  const updated = (await db
    .collection("registrations")
    .where({ activityId: id, userId: user._id, status: "CONFIRMED" })
    .update({
      data: {
        acknowledgedChangeVersion: changeVersion,
        acknowledgedAt: db.serverDate(),
        updatedAt: db.serverDate(),
      },
    })) as { stats: { updated: number } };
  if (updated.stats.updated !== 1) throw new AppError("FORBIDDEN", "只有正式参与者可以确认变更");
  await db.collection("auditLogs").add({
    data: {
      actorId: user._id,
      action: "ACTIVITY_CHANGE_ACKNOWLEDGED",
      objectType: "ACTIVITY",
      objectId: id,
      metadata: { changeVersion },
      createdAt: db.serverDate(),
    },
  });
  return { activityId: id, acknowledgedChangeVersion: changeVersion };
};

export const cancelActivity: Handler = async (payload, context) => {
  if (!isRecord(payload)) throw new AppError("INVALID_ARGUMENT", "请提交有效的取消信息");
  const id = requiredString(payload.id, "球局编号", 64);
  const reason = requiredString(payload.reason, "取消原因", 200);
  const user = await findCurrentUser(context);
  const result = await db.runTransaction(async (transaction: CloudTransaction) => {
    const activities = transaction.collection("activities");
    const activity = documentData<ActivityDocument>(
      await activities.where({ _id: id }).limit(1).get(),
    );
    if (!activity) throw new AppError("ACTIVITY_NOT_FOUND", "球局不存在");
    if (activity.organizerId !== user._id)
      throw new AppError("FORBIDDEN", "只有组织者可以取消球局");
    if (activity.status === "CANCELLED")
      return { status: "CANCELLED", reason: activity.cancelReason };
    if (activity.status === "ENDED" || activity.status === "HIDDEN")
      throw new AppError("INVALID_STATE", "当前状态不能取消球局");
    const now = db.serverDate();
    const changeVersion = (activity.changeVersion ?? 0) + 1;
    await activities.doc(id).update({
      data: {
        status: "CANCELLED",
        cancelReason: reason,
        cancelledAt: now,
        changeVersion,
        version: activity.version + 1,
        updatedAt: now,
      },
    });
    await transaction
      .collection("activityChanges")
      .doc(stableId(`${id}:${changeVersion}`))
      .set({
        data: {
          activityId: id,
          version: changeVersion,
          changedBy: user._id,
          changedFields: ["status"],
          before: { status: activity.status },
          after: { status: "CANCELLED", cancelReason: reason },
          createdAt: now,
        },
      });
    const recipients = [
      ...new Set([...(activity.confirmedUserIds ?? []), ...(activity.waitlistUserIds ?? [])]),
    ].filter((userId) => userId !== user._id);
    for (const userId of recipients) {
      await createNotification(
        transaction,
        {
          userId,
          activityId: id,
          type: "ACTIVITY_CANCELLED",
          title: "球局已取消",
          body: `${activity.title ?? "球局"}已取消：${reason}`,
          dedupeKey: `${id}:ACTIVITY_CANCELLED:${userId}`,
        },
        now,
      );
    }
    await transaction
      .collection("participants")
      .where({ activityId: id, status: "ACTIVE" })
      .update({ data: { status: "CANCELLED", updatedAt: now } });
    const matchSnapshot = documentList<{ _id: string; status: string }>(
      await transaction.collection("matches").where({ activityId: id }).limit(100).get(),
    );
    for (const match of matchSnapshot) {
      await transaction
        .collection("matchPlayers")
        .where({ matchId: match._id })
        .update({ data: { result: "VOID", updatedAt: now } });
      if (match.status !== "LOCKED") {
        await transaction
          .collection("matches")
          .doc(match._id)
          .update({ data: { status: "VOID", updatedAt: now } });
      }
    }
    await transaction
      .collection("rounds")
      .where({ activityId: id })
      .update({ data: { status: "CANCELLED", updatedAt: now } });
    await transaction.collection("auditLogs").add({
      data: {
        actorId: user._id,
        action: "ACTIVITY_CANCELLED",
        objectType: "ACTIVITY",
        objectId: id,
        metadata: { reason },
        createdAt: now,
      },
    });
    return { status: "CANCELLED", reason };
  });
  return { activity: { id, ...result } };
};
