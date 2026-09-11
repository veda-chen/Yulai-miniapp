import { createHash } from "node:crypto";
import { cloud, db } from "../db.js";
import { AppError } from "../errors.js";
import { decryptSubscriptionOpenId, encryptSubscriptionOpenId } from "../identity.js";
import type { CloudEvent, Handler } from "../types.js";
import { findCurrentUser } from "./user.js";

type CloudTransaction = Pick<typeof db, "collection">;
type SubscriptionTemplateKey = "ACTIVITY_UPDATE" | "ACTIVITY_CANCELLED" | "WAITLIST_PROMOTED";

export const SUBSCRIPTION_DELIVERY_TRIGGER_NAME = "deliver-subscription-notifications-every-minute";
export const SUBSCRIPTION_TEMPLATE_IDS: Readonly<Record<SubscriptionTemplateKey, string>> = {
  ACTIVITY_UPDATE: "cqCZYss6j--bOHkYnZs2VEJoxE6mBK6ifpuocdagg0A",
  ACTIVITY_CANCELLED: "cqCZYss6j--bOHkYnZs2VEJoxE6mBK6ifpuocdagg0A",
  WAITLIST_PROMOTED: "SH-jFRByW81RL-m1nmw294VxYQ8Fota5ysyGd4XMgkM",
};

type NotificationInput = {
  userId: string;
  activityId: string | null;
  type: string;
  title: string;
  body: string;
  dedupeKey: string;
};

type NotificationDocument = NotificationInput & {
  _id: string;
  status: string;
  createdAt: Date | string;
  readAt?: Date | string;
  subscriptionTemplateKey?: SubscriptionTemplateKey;
  subscriptionStatus?: string;
  subscriptionAttempts?: number;
};

type SubscriptionPreferenceDocument = {
  _id: string;
  templateKey: string;
  templateId: string;
  status: string;
  recipientOpenIdEncrypted: string;
  updatedAt?: Date | string;
};

type ActivityForSubscription = {
  title?: string | null;
  startAt: Date | string;
  venueName: string;
  locationHint?: string | null;
  cancelReason?: string | null;
};

type SubscriptionData = Record<string, { value: string }>;

const TEMPLATE_KEYS = new Set(["ACTIVITY_UPDATE", "ACTIVITY_CANCELLED", "WAITLIST_PROMOTED"]);
const SUBSCRIPTION_STATUSES = new Set(["accept", "reject", "ban"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isoDate(value: Date | string | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function truncate(value: string, maxLength = 20): string {
  return Array.from(value.trim()).slice(0, maxLength).join("");
}

function chinaDateTime(value: Date | string): string {
  const source = value instanceof Date ? value : new Date(value);
  const date = new Date(source.getTime() + 8 * 60 * 60 * 1000);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getUTCFullYear()}年${pad(date.getUTCMonth() + 1)}月${pad(date.getUTCDate())}日 ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

function subscriptionTemplateKey(type: string): SubscriptionTemplateKey | null {
  if (type === "ACTIVITY_CHANGED") return "ACTIVITY_UPDATE";
  if (type === "ACTIVITY_CANCELLED") return "ACTIVITY_CANCELLED";
  if (type === "REGISTRATION_PROMOTED") return "WAITLIST_PROMOTED";
  return null;
}

export function buildSubscriptionData(
  templateKey: SubscriptionTemplateKey,
  activity: ActivityForSubscription,
): SubscriptionData {
  const title = truncate(activity.title || "羽毛球局");
  const time = chinaDateTime(activity.startAt);
  const address = truncate(activity.venueName || activity.locationHint || "活动场馆");
  if (templateKey === "WAITLIST_PROMOTED") {
    return {
      thing1: { value: title },
      time18: { value: time },
      thing12: { value: address },
      thing8: { value: "候补递补成功" },
      thing5: { value: "请进入羽来查看球局详情" },
    };
  }
  return {
    thing6: { value: title },
    time10: { value: time },
    thing2: { value: address },
    thing13: { value: templateKey === "ACTIVITY_CANCELLED" ? "已取消" : "已变更" },
    thing24: {
      value:
        templateKey === "ACTIVITY_CANCELLED"
          ? truncate(activity.cancelReason || "组织者取消球局")
          : "球局时间、地点或人数有调整",
    },
  };
}

export function isSubscriptionDeliveryTimerEvent(event: CloudEvent): boolean {
  return event.Type === "Timer" && event.TriggerName === SUBSCRIPTION_DELIVERY_TRIGGER_NAME;
}

export function notificationId(dedupeKey: string): string {
  return createHash("sha256").update(dedupeKey).digest("hex").slice(0, 32);
}

function subscriptionPreferenceId(userId: string, templateId: string): string {
  return createHash("sha256").update(`${userId}:${templateId}`).digest("hex").slice(0, 32);
}

export function parseSubscriptionPreferences(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.preferences)) {
    throw new AppError("INVALID_ARGUMENT", "订阅授权结果无效");
  }
  if (payload.preferences.length < 1 || payload.preferences.length > 3) {
    throw new AppError("INVALID_ARGUMENT", "每次最多记录3个订阅模板");
  }
  return payload.preferences.map((item) => {
    if (!isRecord(item)) throw new AppError("INVALID_ARGUMENT", "订阅授权结果无效");
    const templateKey = item.templateKey;
    const templateId = item.templateId;
    const status = item.status;
    if (typeof templateKey !== "string" || !TEMPLATE_KEYS.has(templateKey)) {
      throw new AppError("INVALID_ARGUMENT", "订阅模板类型无效");
    }
    if (typeof templateId !== "string" || templateId.length < 8 || templateId.length > 128) {
      throw new AppError("INVALID_ARGUMENT", "订阅模板编号无效");
    }
    const expectedId = SUBSCRIPTION_TEMPLATE_IDS[templateKey as SubscriptionTemplateKey];
    if (templateId !== expectedId) throw new AppError("INVALID_ARGUMENT", "订阅模板编号无效");
    if (typeof status !== "string" || !SUBSCRIPTION_STATUSES.has(status)) {
      throw new AppError("INVALID_ARGUMENT", "订阅授权状态无效");
    }
    return { templateKey, templateId, status };
  });
}

export async function createNotification(
  transaction: CloudTransaction,
  input: NotificationInput,
  createdAt: unknown,
) {
  const templateKey = subscriptionTemplateKey(input.type);
  await transaction
    .collection("notificationJobs")
    .doc(notificationId(input.dedupeKey))
    .set({
      data: {
        ...input,
        channel: "IN_APP",
        status: "READY",
        attempts: 0,
        subscriptionTemplateKey: templateKey,
        subscriptionStatus: templateKey ? "PENDING" : "NOT_APPLICABLE",
        subscriptionAttempts: 0,
        createdAt,
        updatedAt: createdAt,
      },
    });
}

export const listNotifications: Handler = async (_payload, context) => {
  const user = await findCurrentUser(context);
  const result = (await db
    .collection("notificationJobs")
    .where({ userId: user._id, status: db.command.in(["READY", "READ"]) })
    .orderBy("createdAt", "desc")
    .limit(50)
    .get()) as unknown as { data: NotificationDocument[] };
  return {
    notifications: result.data.map((item) => ({
      id: item._id,
      activityId: item.activityId,
      type: item.type,
      title: item.title,
      body: item.body,
      isRead: item.status === "READ",
      createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt,
    })),
  };
};

export const listSubscriptionPreferences: Handler = async (_payload, context) => {
  const user = await findCurrentUser(context);
  const result = (await db
    .collection("subscriptionPreferences")
    .where({ userId: user._id })
    .orderBy("updatedAt", "desc")
    .limit(20)
    .get()) as unknown as { data: SubscriptionPreferenceDocument[] };
  return {
    preferences: result.data.map((item) => ({
      templateKey: item.templateKey,
      templateId: item.templateId,
      status: item.status,
      updatedAt: isoDate(item.updatedAt),
    })),
  };
};

export const saveSubscriptionPreferences: Handler = async (payload, context) => {
  const preferences = parseSubscriptionPreferences(payload);
  const user = await findCurrentUser(context);
  if (user.status !== "ACTIVE") {
    throw new AppError("ACCOUNT_RESTRICTED", "当前账号暂不能设置订阅提醒");
  }
  if (!context.openid) throw new AppError("UNAUTHENTICATED", "无法识别当前微信用户");
  const recipientOpenIdEncrypted = encryptSubscriptionOpenId(context.openid);
  await Promise.all(
    preferences.map((preference) =>
      db
        .collection("subscriptionPreferences")
        .doc(subscriptionPreferenceId(user._id, preference.templateId))
        .set({
          data: {
            userId: user._id,
            ...preference,
            source: "WECHAT_REQUEST_SUBSCRIBE_MESSAGE",
            recipientOpenIdEncrypted,
            updatedAt: db.serverDate(),
          },
        }),
    ),
  );
  return { preferences };
};

function errorDetails(error: unknown): { code: number | string; message: string } {
  if (!isRecord(error)) return { code: "UNKNOWN", message: "订阅消息发送失败" };
  const code = error.errCode ?? error.errcode ?? "UNKNOWN";
  const rawMessage = error.errMsg ?? error.errmsg ?? error.message;
  return {
    code: typeof code === "number" || typeof code === "string" ? code : "UNKNOWN",
    message: typeof rawMessage === "string" ? rawMessage.slice(0, 200) : "订阅消息发送失败",
  };
}

async function markSubscriptionJob(id: string, data: Record<string, unknown>) {
  await db
    .collection("notificationJobs")
    .doc(id)
    .update({
      data: { ...data, subscriptionUpdatedAt: db.serverDate(), updatedAt: db.serverDate() },
    });
}

async function deliverSubscriptionMessage(job: NotificationDocument) {
  const templateKey = job.subscriptionTemplateKey;
  if (!templateKey || !job.activityId) {
    await markSubscriptionJob(job._id, { subscriptionStatus: "FAILED_PERMANENT" });
    return "failed" as const;
  }
  const templateId = SUBSCRIPTION_TEMPLATE_IDS[templateKey];
  const preferenceResult = (await db
    .collection("subscriptionPreferences")
    .where({ userId: job.userId, templateId, status: "accept" })
    .limit(1)
    .get()) as unknown as { data: SubscriptionPreferenceDocument[] };
  const preference = preferenceResult.data[0];
  if (!preference) {
    await markSubscriptionJob(job._id, { subscriptionStatus: "SKIPPED_NO_AUTHORIZATION" });
    return "skipped" as const;
  }
  const activityResult = (await db
    .collection("activities")
    .where({ _id: job.activityId })
    .limit(1)
    .get()) as unknown as { data: ActivityForSubscription[] };
  const activity = activityResult.data[0];
  if (!activity) {
    await markSubscriptionJob(job._id, { subscriptionStatus: "FAILED_PERMANENT" });
    return "failed" as const;
  }

  const attempts = (job.subscriptionAttempts ?? 0) + 1;
  try {
    const result = (await cloud.openapi.subscribeMessage.send({
      touser: decryptSubscriptionOpenId(preference.recipientOpenIdEncrypted),
      templateId,
      page: `pages/activities/detail?id=${job.activityId}`,
      miniprogramState: process.env.WECHAT_MINIPROGRAM_STATE || "developer",
      lang: "zh_CN",
      data: buildSubscriptionData(templateKey, activity),
    })) as Record<string, unknown>;
    const resultCode = result.errCode ?? result.errcode ?? 0;
    if (resultCode !== 0) throw result;
    await markSubscriptionJob(job._id, {
      subscriptionStatus: "SENT",
      subscriptionAttempts: attempts,
      subscriptionSentAt: db.serverDate(),
      subscriptionErrorCode: null,
      subscriptionErrorMessage: null,
    });
    await db
      .collection("subscriptionPreferences")
      .doc(preference._id)
      .update({
        data: { status: "consumed", consumedAt: db.serverDate(), updatedAt: db.serverDate() },
      });
    return "sent" as const;
  } catch (error) {
    const details = errorDetails(error);
    const permanentCodes = new Set([40003, 40037, 41030, 43101, 47003]);
    const permanent = permanentCodes.has(Number(details.code)) || attempts >= 3;
    await markSubscriptionJob(job._id, {
      subscriptionStatus: permanent ? "FAILED_PERMANENT" : "PENDING",
      subscriptionAttempts: attempts,
      subscriptionErrorCode: details.code,
      subscriptionErrorMessage: details.message,
    });
    if (Number(details.code) === 43101) {
      await db
        .collection("subscriptionPreferences")
        .doc(preference._id)
        .update({
          data: { status: "consumed", consumedAt: db.serverDate(), updatedAt: db.serverDate() },
        });
    }
    console.error(
      JSON.stringify({ jobId: job._id, code: details.code, message: details.message, attempts }),
    );
    return "failed" as const;
  }
}

export async function processPendingSubscriptionMessages() {
  const result = (await db
    .collection("notificationJobs")
    .where({ subscriptionStatus: "PENDING" })
    .orderBy("createdAt", "asc")
    .limit(5)
    .get()) as unknown as { data: NotificationDocument[] };
  const counts: Record<"processed" | "sent" | "skipped" | "failed", number> = {
    processed: result.data.length,
    sent: 0,
    skipped: 0,
    failed: 0,
  };
  for (const job of result.data) {
    const outcome = await deliverSubscriptionMessage(job);
    counts[outcome] += 1;
  }
  return counts;
}

export const markNotificationRead: Handler = async (payload, context) => {
  if (
    !isRecord(payload) ||
    typeof payload.id !== "string" ||
    payload.id.length < 1 ||
    payload.id.length > 64
  ) {
    throw new AppError("INVALID_ARGUMENT", "通知编号无效");
  }
  const user = await findCurrentUser(context);
  const result = (await db
    .collection("notificationJobs")
    .where({ _id: payload.id, userId: user._id })
    .update({ data: { status: "READ", readAt: db.serverDate(), updatedAt: db.serverDate() } })) as {
    stats: { updated: number };
  };
  if (result.stats.updated !== 1) throw new AppError("NOTIFICATION_NOT_FOUND", "通知不存在");
  return { id: payload.id, isRead: true };
};
