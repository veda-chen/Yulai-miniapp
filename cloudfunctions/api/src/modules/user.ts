import { createHash } from "node:crypto";
import { cloud, db } from "../db.js";
import { AppError } from "../errors.js";
import { hashOpenId } from "../identity.js";
import type { Handler, RequestContext } from "../types.js";

const USER_LEVELS = new Set([
  "UNKNOWN",
  "CASUAL",
  "BEGINNER",
  "IMPROVING",
  "COMPETITIVE",
  "LIN_DAN",
  "DOUYIN_AVERAGE",
]);
const UPDATE_FIELDS = new Set(["nickname", "schoolId", "schoolName", "level"]);

export type UserDocument = {
  _id: string;
  openidHash: string;
  nickname: string | null;
  avatarFileId: string | null;
  schoolId: string | null;
  schoolName?: string | null;
  level: string;
  status: string;
  role?: string;
};

type CloudTransaction = Pick<typeof db, "collection">;

type SchoolDocument = {
  _id: string;
  name: string;
};

type ProfileUpdate = {
  nickname?: string;
  schoolId?: string | null;
  schoolName?: string | null;
  level?: string;
};

type AvatarUpdate = {
  avatarFileId: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseProfileUpdate(payload: unknown): ProfileUpdate {
  if (!isRecord(payload)) {
    throw new AppError("INVALID_ARGUMENT", "请提交有效的资料");
  }
  const unknownField = Object.keys(payload).find((key) => !UPDATE_FIELDS.has(key));
  if (unknownField) {
    throw new AppError("INVALID_ARGUMENT", `不支持修改字段：${unknownField}`);
  }

  const update: ProfileUpdate = {};
  if ("nickname" in payload) {
    if (typeof payload.nickname !== "string") {
      throw new AppError("INVALID_ARGUMENT", "昵称格式不正确");
    }
    const nickname = payload.nickname.trim();
    if (nickname.length < 1 || nickname.length > 24) {
      throw new AppError("INVALID_ARGUMENT", "昵称需为1至24个字符");
    }
    update.nickname = nickname;
  }
  if ("schoolId" in payload) {
    if (payload.schoolId === null) {
      update.schoolId = null;
    } else if (
      typeof payload.schoolId === "string" &&
      payload.schoolId.length >= 1 &&
      payload.schoolId.length <= 64
    ) {
      update.schoolId = payload.schoolId;
    } else {
      throw new AppError("INVALID_ARGUMENT", "学校选择无效");
    }
  }
  if ("schoolName" in payload) {
    if (payload.schoolName === null) {
      update.schoolName = null;
    } else if (typeof payload.schoolName === "string") {
      const schoolName = payload.schoolName.trim();
      if (schoolName.length > 40) {
        throw new AppError("INVALID_ARGUMENT", "学校名称不能超过40个字符");
      }
      update.schoolName = schoolName || null;
    } else {
      throw new AppError("INVALID_ARGUMENT", "学校名称格式不正确");
    }
  }
  if ("level" in payload) {
    if (typeof payload.level !== "string" || !USER_LEVELS.has(payload.level)) {
      throw new AppError("INVALID_ARGUMENT", "水平选择无效");
    }
    update.level = payload.level;
  }
  if (Object.keys(update).length === 0) {
    throw new AppError("INVALID_ARGUMENT", "没有需要保存的资料");
  }
  return update;
}

export function parseAvatarUpdate(payload: unknown, userId: string): AvatarUpdate {
  if (!isRecord(payload) || !("avatarFileId" in payload)) {
    throw new AppError("INVALID_ARGUMENT", "请提交有效的头像信息");
  }
  if (payload.avatarFileId === null) return { avatarFileId: null };
  if (typeof payload.avatarFileId !== "string" || payload.avatarFileId.length > 512) {
    throw new AppError("INVALID_ARGUMENT", "头像文件无效");
  }
  const escapedUserId = userId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const ownedPath = new RegExp(
    `^cloud://[^/]+/avatars/${escapedUserId}/[A-Za-z0-9][A-Za-z0-9._-]{0,119}$`,
  );
  if (!ownedPath.test(payload.avatarFileId)) {
    throw new AppError("INVALID_ARGUMENT", "头像文件不属于当前用户");
  }
  return { avatarFileId: payload.avatarFileId };
}

function avatarCleanupId(fileId: string): string {
  return createHash("sha256").update(fileId).digest("hex").slice(0, 32);
}

async function queueAvatarCleanup(store: CloudTransaction, fileId: string) {
  await store
    .collection("fileCleanupJobs")
    .doc(avatarCleanupId(fileId))
    .set({
      data: {
        fileId,
        status: "PENDING",
        attempts: 0,
        nextAttemptAt: db.serverDate(),
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
      },
    });
}

async function deleteAvatarFile(fileId: string | null, queued = false) {
  if (!fileId) return;
  try {
    const result = (await cloud.deleteFile({ fileList: [fileId] })) as {
      fileList?: Array<{ status?: number }>;
    };
    if (result.fileList?.some((item) => typeof item.status === "number" && item.status !== 0))
      throw new Error("云存储文件删除失败");
    if (queued) await db.collection("fileCleanupJobs").doc(avatarCleanupId(fileId)).remove();
  } catch {
    if (!queued) {
      try {
        await queueAvatarCleanup(db, fileId);
      } catch {
        console.error(JSON.stringify({ code: "AVATAR_CLEANUP_QUEUE_FAILED" }));
      }
    }
    console.error(JSON.stringify({ code: "AVATAR_DELETE_FAILED", queued }));
  }
}

export async function findCurrentUser(context: RequestContext): Promise<UserDocument> {
  if (!context.openid) {
    throw new AppError("UNAUTHENTICATED", "无法识别当前微信用户");
  }
  const result = (await db
    .collection("users")
    .where({ openidHash: hashOpenId(context.openid) })
    .limit(1)
    .get()) as unknown as { data: UserDocument[] };
  const user = result.data[0];
  if (!user) {
    throw new AppError("PROFILE_NOT_FOUND", "请先初始化用户资料");
  }
  return user;
}

async function mapProfile(user: UserDocument) {
  let school: SchoolDocument | null = null;
  const customSchoolName = user.schoolName?.trim();
  if (customSchoolName) {
    school = { _id: "custom", name: customSchoolName };
  } else if (user.schoolId) {
    const result = (await db
      .collection("schools")
      .where({ _id: user.schoolId, status: "ACTIVE" })
      .limit(1)
      .get()) as unknown as { data: SchoolDocument[] };
    school = result.data[0] ?? null;
  }
  return {
    id: user._id,
    nickname: user.nickname,
    avatarFileId: user.avatarFileId,
    school: school ? { id: school._id, name: school.name } : null,
    level: user.level,
    status: user.status,
    role: user.role ?? "USER",
    needsProfile: !user.nickname,
  };
}

export const getMe: Handler = async (_payload, context) => {
  return { user: await mapProfile(await findCurrentUser(context)) };
};

export const updateMe: Handler = async (payload, context) => {
  const user = await findCurrentUser(context);
  if (user.status !== "ACTIVE") {
    throw new AppError("ACCOUNT_RESTRICTED", "当前账号暂不能修改资料");
  }
  const update = parseProfileUpdate(payload);

  const persistedUpdate: ProfileUpdate = { ...update };
  if ("schoolName" in update) persistedUpdate.schoolId = null;
  else if ("schoolId" in update && user.schoolName) persistedUpdate.schoolName = null;

  if (persistedUpdate.schoolId) {
    const school = (await db
      .collection("schools")
      .where({ _id: persistedUpdate.schoolId, status: "ACTIVE" })
      .limit(1)
      .get()) as unknown as { data: SchoolDocument[] };
    if (!school.data[0]) {
      throw new AppError("SCHOOL_NOT_FOUND", "所选学校不存在或已停用");
    }
  }

  await db
    .collection("users")
    .doc(user._id)
    .update({ data: { ...persistedUpdate, updatedAt: db.serverDate() } });
  return { user: await mapProfile({ ...user, ...persistedUpdate }) };
};

export const updateAvatar: Handler = async (payload, context) => {
  const user = await findCurrentUser(context);
  if (user.status !== "ACTIVE") {
    throw new AppError("ACCOUNT_RESTRICTED", "当前账号暂不能修改头像");
  }
  const update = parseAvatarUpdate(payload, user._id);
  if (update.avatarFileId === user.avatarFileId) {
    return { user: await mapProfile(user) };
  }
  await db
    .collection("users")
    .doc(user._id)
    .update({ data: { ...update, updatedAt: db.serverDate() } });
  await deleteAvatarFile(user.avatarFileId);
  return { user: await mapProfile({ ...user, ...update }) };
};

export function parseAccountDeletion(payload: unknown): void {
  if (!isRecord(payload) || payload.confirmation !== "DELETE_MY_ACCOUNT") {
    throw new AppError("INVALID_ARGUMENT", "请确认注销账号");
  }
}

async function assertNoActiveCommitments(store: CloudTransaction, userId: string) {
  const organized = (await store
    .collection("activities")
    .where({ organizerId: userId, status: db.command.in(["OPEN", "IN_PROGRESS"]) })
    .limit(1)
    .get()) as unknown as { data: unknown[] };
  if (organized.data[0])
    throw new AppError("ACTIVE_ACTIVITIES_EXIST", "请先取消或结束正在组织的球局");

  let registrationOffset = 0;
  while (true) {
    const registrations = (await store
      .collection("registrations")
      .where({
        userId,
        status: db.command.in(["CONFIRMED", "WAITLISTED", "PROMOTED"]),
      })
      .skip(registrationOffset)
      .limit(100)
      .get()) as unknown as { data: Array<{ activityId: string }> };
    const activityIds = [...new Set(registrations.data.map((item) => item.activityId))];
    if (activityIds.length > 0) {
      const active = (await store
        .collection("activities")
        .where({ _id: db.command.in(activityIds), status: db.command.in(["OPEN", "IN_PROGRESS"]) })
        .limit(1)
        .get()) as unknown as { data: unknown[] };
      if (active.data[0])
        throw new AppError("ACTIVE_REGISTRATIONS_EXIST", "请先退出已报名或候补的球局");
    }
    if (registrations.data.length < 100) break;
    registrationOffset += 100;
  }
}

export const deleteMe: Handler = async (payload, context) => {
  parseAccountDeletion(payload);
  const user = await findCurrentUser(context);
  if (user.status === "DELETED") throw new AppError("ACCOUNT_NOT_ACTIVE", "当前账号已经注销");
  if (user.role === "ADMIN") throw new AppError("ADMIN_ACCOUNT", "管理员账号不能在小程序内注销");

  await db.runTransaction(async (transaction: CloudTransaction) => {
    const freshUser = (await transaction
      .collection("users")
      .where({ _id: user._id })
      .limit(1)
      .get()) as unknown as { data: UserDocument[] };
    if (freshUser.data[0]?.status === "DELETED")
      throw new AppError("ACCOUNT_NOT_ACTIVE", "当前账号已经注销");
    await assertNoActiveCommitments(transaction, user._id);
    const deletedAt = db.serverDate();
    if (user.avatarFileId) await queueAvatarCleanup(transaction, user.avatarFileId);
    await transaction
      .collection("users")
      .doc(user._id)
      .update({
        data: {
          nickname: null,
          avatarFileId: null,
          schoolId: null,
          schoolName: null,
          level: "UNKNOWN",
          status: "DELETED",
          deletedAt,
          updatedAt: deletedAt,
        },
      });
    await transaction.collection("subscriptionPreferences").where({ userId: user._id }).remove();
    await transaction.collection("appearancePreferences").where({ userId: user._id }).remove();
    await transaction.collection("playInvitationReplies").where({ userId: user._id }).remove();
    await transaction
      .collection("playInvitations")
      .where({ ownerId: user._id })
      .update({ data: { ownerName: "已注销球友" } });
    await transaction
      .collection("activities")
      .where({ organizerId: user._id })
      .update({ data: { organizerName: "已注销球友", contact: null } });
    await transaction
      .collection("registrations")
      .where({ userId: user._id })
      .update({ data: { nickname: "已注销球友" } });
    await transaction.collection("auditLogs").add({
      data: {
        actorId: user._id,
        action: "USER_DELETED",
        objectType: "USER",
        objectId: user._id,
        metadata: { anonymized: true },
        createdAt: deletedAt,
      },
    });
  });
  await deleteAvatarFile(user.avatarFileId, true);
  return { deleted: true };
};
