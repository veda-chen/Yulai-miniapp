import { db } from "../db.js";
import { AppError } from "../errors.js";
import type { Handler } from "../types.js";
import { findCurrentUser, type UserDocument } from "./user.js";

const REPORT_STATUSES = new Set(["OPEN", "RESOLVED", "DISMISSED"]);

type ReportDocument = {
  _id: string;
  reporterId: string;
  targetType: string;
  targetId: string;
  reason: string;
  details: string;
  status: string;
  resolutionNote?: string;
  resolvedBy?: string;
  createdAt?: unknown;
  resolvedAt?: unknown;
};

type AuditDocument = {
  _id: string;
  actorId: string;
  action: string;
  objectType: string;
  objectId: string;
  metadata?: unknown;
  createdAt?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim().length < 1 || value.trim().length > maxLength) {
    throw new AppError("INVALID_ARGUMENT", `${label}格式不正确`);
  }
  return value.trim();
}

function serializeDate(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function auditSummary(metadata: unknown): string {
  if (!isRecord(metadata)) return "";
  const value = metadata.reason ?? metadata.note ?? metadata.outcome;
  return typeof value === "string" ? value.slice(0, 200) : "";
}

async function requireAdmin(context: Parameters<Handler>[1]): Promise<UserDocument> {
  const user = await findCurrentUser(context);
  if (user.role !== "ADMIN") throw new AppError("FORBIDDEN", "需要管理员权限");
  return user;
}

export const getAdminDashboard: Handler = async (_payload, context) => {
  await requireAdmin(context);
  const [openReports, activeUsers, openActivities] = (await Promise.all([
    db.collection("reports").where({ status: "OPEN" }).count(),
    db.collection("users").where({ status: "ACTIVE" }).count(),
    db.collection("activities").where({ status: "OPEN" }).count(),
  ])) as Array<{ total: number }>;
  return {
    metrics: {
      openReports: openReports?.total ?? 0,
      activeUsers: activeUsers?.total ?? 0,
      openActivities: openActivities?.total ?? 0,
    },
  };
};

export const listReports: Handler = async (payload, context) => {
  await requireAdmin(context);
  const status = isRecord(payload) && typeof payload.status === "string" ? payload.status : "OPEN";
  if (!REPORT_STATUSES.has(status)) throw new AppError("INVALID_ARGUMENT", "举报状态无效");
  const result = (await db
    .collection("reports")
    .where({ status })
    .orderBy("createdAt", "desc")
    .limit(50)
    .get()) as unknown as { data: ReportDocument[] };
  return {
    reports: result.data.map((report) => ({
      id: report._id,
      reporterId: report.reporterId,
      targetType: report.targetType,
      targetId: report.targetId,
      reason: report.reason,
      details: report.details,
      status: report.status,
      resolutionNote: report.resolutionNote ?? null,
      resolvedBy: report.resolvedBy ?? null,
      createdAt: serializeDate(report.createdAt),
      resolvedAt: serializeDate(report.resolvedAt),
    })),
  };
};

export const listAuditLogs: Handler = async (_payload, context) => {
  await requireAdmin(context);
  const result = (await db
    .collection("auditLogs")
    .orderBy("createdAt", "desc")
    .limit(50)
    .get()) as unknown as { data: AuditDocument[] };
  return {
    logs: result.data.map((log) => ({
      id: log._id,
      actorId: log.actorId,
      action: log.action,
      objectType: log.objectType,
      objectId: log.objectId,
      summary: auditSummary(log.metadata),
      createdAt: serializeDate(log.createdAt),
    })),
  };
};

export const resolveReport: Handler = async (payload, context) => {
  if (!isRecord(payload)) throw new AppError("INVALID_ARGUMENT", "请提交有效的处置信息");
  const id = requiredText(payload.id, "举报编号", 64);
  const outcome = requiredText(payload.outcome, "处置结果", 20);
  const note = requiredText(payload.note, "处置说明", 500);
  if (outcome !== "RESOLVED" && outcome !== "DISMISSED") {
    throw new AppError("INVALID_ARGUMENT", "处置结果无效");
  }
  const admin = await requireAdmin(context);
  const updated = (await db
    .collection("reports")
    .where({ _id: id, status: "OPEN" })
    .update({
      data: {
        status: outcome,
        resolutionNote: note,
        resolvedBy: admin._id,
        resolvedAt: db.serverDate(),
        updatedAt: db.serverDate(),
      },
    })) as { stats: { updated: number } };
  if (updated.stats.updated !== 1) throw new AppError("REPORT_NOT_OPEN", "举报不存在或已处理");
  await db.collection("auditLogs").add({
    data: {
      actorId: admin._id,
      action: "REPORT_RESOLVED",
      objectType: "REPORT",
      objectId: id,
      metadata: { outcome, note },
      createdAt: db.serverDate(),
    },
  });
  return { report: { id, status: outcome } };
};

export const unpublishActivity: Handler = async (payload, context) => {
  if (!isRecord(payload)) throw new AppError("INVALID_ARGUMENT", "请提交有效的下架信息");
  const id = requiredText(payload.id, "球局编号", 64);
  const reason = requiredText(payload.reason, "下架原因", 500);
  const admin = await requireAdmin(context);
  const updated = (await db
    .collection("activities")
    .where({ _id: id })
    .update({
      data: {
        status: "HIDDEN",
        moderationReason: reason,
        moderatedBy: admin._id,
        updatedAt: db.serverDate(),
      },
    })) as { stats: { updated: number } };
  if (updated.stats.updated !== 1) throw new AppError("ACTIVITY_NOT_FOUND", "球局不存在");
  await db.collection("auditLogs").add({
    data: {
      actorId: admin._id,
      action: "ACTIVITY_HIDDEN",
      objectType: "ACTIVITY",
      objectId: id,
      metadata: { reason },
      createdAt: db.serverDate(),
    },
  });
  return { activity: { id, status: "HIDDEN" } };
};

export const restrictUser: Handler = async (payload, context) => {
  if (!isRecord(payload)) throw new AppError("INVALID_ARGUMENT", "请提交有效的账号处置信息");
  const id = requiredText(payload.id, "用户编号", 64);
  const reason = requiredText(payload.reason, "限制原因", 500);
  const admin = await requireAdmin(context);
  if (id === admin._id) throw new AppError("INVALID_ARGUMENT", "不能限制当前管理员账号");
  const updated = (await db
    .collection("users")
    .where({ _id: id })
    .update({
      data: {
        status: "RESTRICTED",
        restrictionReason: reason,
        restrictedBy: admin._id,
        updatedAt: db.serverDate(),
      },
    })) as { stats: { updated: number } };
  if (updated.stats.updated !== 1) throw new AppError("USER_NOT_FOUND", "用户不存在");
  await db.collection("auditLogs").add({
    data: {
      actorId: admin._id,
      action: "USER_RESTRICTED",
      objectType: "USER",
      objectId: id,
      metadata: { reason },
      createdAt: db.serverDate(),
    },
  });
  return { user: { id, status: "RESTRICTED" } };
};
