import { db } from "../db.js";
import { AppError } from "../errors.js";
import type { Handler } from "../types.js";
import { findCurrentUser } from "./user.js";

const TARGET_COLLECTIONS = {
  ACTIVITY: "activities",
  VENUE: "venues",
  USER: "users",
} as const;
const REASONS = new Set([
  "CONTENT_INAPPROPRIATE",
  "FALSE_INFO",
  "HARASSMENT",
  "ORGANIZER_UNREACHABLE",
  "OTHER",
]);

type ReportDocument = { _id: string; status: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim().length < 1 || value.trim().length > maxLength) {
    throw new AppError("INVALID_ARGUMENT", `${label}格式不正确`);
  }
  return value.trim();
}

export const createReport: Handler = async (payload, context) => {
  if (!isRecord(payload)) throw new AppError("INVALID_ARGUMENT", "请提交有效的举报信息");
  const targetType = requiredText(
    payload.targetType,
    "举报对象",
    20,
  ) as keyof typeof TARGET_COLLECTIONS;
  const targetId = requiredText(payload.targetId, "对象编号", 64);
  const reason = requiredText(payload.reason, "举报原因", 40);
  const details = requiredText(payload.details, "补充说明", 500);
  if (!(targetType in TARGET_COLLECTIONS)) throw new AppError("INVALID_ARGUMENT", "举报对象无效");
  if (!REASONS.has(reason)) throw new AppError("INVALID_ARGUMENT", "举报原因无效");
  const user = await findCurrentUser(context);
  if (user.status !== "ACTIVE") throw new AppError("ACCOUNT_RESTRICTED", "当前账号暂不能举报");

  const target = (await db
    .collection(TARGET_COLLECTIONS[targetType])
    .where({ _id: targetId })
    .limit(1)
    .get()) as unknown as { data: unknown[] };
  if (!target.data[0]) throw new AppError("TARGET_NOT_FOUND", "举报对象不存在");

  const reports = db.collection("reports");
  const existing = (await reports
    .where({ reporterId: user._id, targetType, targetId, status: "OPEN" })
    .limit(1)
    .get()) as unknown as { data: ReportDocument[] };
  if (existing.data[0]) return { report: { id: existing.data[0]._id, status: "OPEN" } };

  const created = (await reports.add({
    data: {
      reporterId: user._id,
      targetType,
      targetId,
      reason,
      details,
      status: "OPEN",
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
    },
  })) as { _id: string };
  return { report: { id: created._id, status: "OPEN" } };
};
