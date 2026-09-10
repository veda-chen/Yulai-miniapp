import { db } from "../db.js";
import { AppError } from "../errors.js";
import { hashOpenId } from "../identity.js";
import type { Handler, RequestContext } from "../types.js";

const USER_LEVELS = new Set(["UNKNOWN", "CASUAL", "BEGINNER", "IMPROVING", "COMPETITIVE"]);
const UPDATE_FIELDS = new Set(["nickname", "schoolId", "level"]);

export type UserDocument = {
  _id: string;
  openidHash: string;
  nickname: string | null;
  avatarFileId: string | null;
  schoolId: string | null;
  level: string;
  status: string;
  role?: string;
};

type SchoolDocument = {
  _id: string;
  name: string;
};

type ProfileUpdate = {
  nickname?: string;
  schoolId?: string | null;
  level?: string;
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
  if (user.schoolId) {
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
    school,
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

  if (update.schoolId) {
    const school = (await db
      .collection("schools")
      .where({ _id: update.schoolId, status: "ACTIVE" })
      .limit(1)
      .get()) as unknown as { data: SchoolDocument[] };
    if (!school.data[0]) {
      throw new AppError("SCHOOL_NOT_FOUND", "所选学校不存在或已停用");
    }
  }

  await db
    .collection("users")
    .doc(user._id)
    .update({ data: { ...update, updatedAt: db.serverDate() } });
  return { user: await mapProfile({ ...user, ...update }) };
};
