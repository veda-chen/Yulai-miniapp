import { createHash } from "node:crypto";
import { db } from "../db.js";
import { AppError } from "../errors.js";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function notificationId(dedupeKey: string): string {
  return createHash("sha256").update(dedupeKey).digest("hex").slice(0, 32);
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
