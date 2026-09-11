import { createHash } from "node:crypto";
import { db } from "../db.js";
import { AppError } from "../errors.js";
import { encryptSubscriptionOpenId } from "../identity.js";
import type { Handler } from "../types.js";
import { findCurrentUser } from "./user.js";

type CloudTransaction = Pick<typeof db, "collection">;

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
};

type SubscriptionPreferenceDocument = {
  _id: string;
  templateKey: string;
  templateId: string;
  status: string;
  updatedAt?: Date | string;
};

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
  await transaction
    .collection("notificationJobs")
    .doc(notificationId(input.dedupeKey))
    .set({
      data: {
        ...input,
        channel: "IN_APP",
        status: "READY",
        attempts: 0,
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
