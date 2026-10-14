import { createHash } from "node:crypto";
import { db } from "../db.js";
import { AppError } from "../errors.js";
import type { Handler } from "../types.js";
import { findCurrentUser } from "./user.js";

const PRESETS = {
  cute: { title: "这周有没有球打鸭？", line: "再不打球，我的球拍都要长蘑菇了。" },
  wild: { title: "快快打球啦！", line: "我要长在椅子上了，快来把我捞走！" },
  challenge: { title: "球场见！", line: "输赢随意，嘴硬到底。敢不敢来？" },
} as const;
type Choice = "YES" | "MAYBE" | "NO";
type Invitation = {
  _id: string;
  ownerId: string;
  ownerName: string;
  preset: keyof typeof PRESETS;
  title: string;
  line: string;
  createdAt: Date;
};
type Reply = { userId: string; nickname: string; choice: Choice; updatedAt: Date };

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AppError("INVALID_ARGUMENT", "邀请信息无效");
  return value as Record<string, unknown>;
}

function idFrom(payload: unknown): string {
  const id = object(payload).id;
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(id))
    throw new AppError("INVALID_ARGUMENT", "邀请链接无效");
  return id;
}

async function readInvitation(id: string): Promise<Invitation> {
  const result = (await db
    .collection("playInvitations")
    .where({ _id: id })
    .limit(1)
    .get()) as unknown as {
    data: Invitation[];
  };
  const invite = result.data[0];
  if (!invite) throw new AppError("NOT_FOUND", "这张邀请卡不存在");
  return invite;
}

export const createInvitation: Handler = async (payload, context) => {
  const input = object(payload);
  if (typeof input.preset !== "string" || !(input.preset in PRESETS))
    throw new AppError("INVALID_ARGUMENT", "请选择邀请风格");
  const preset = input.preset as keyof typeof PRESETS;
  const title = input.title === undefined ? PRESETS[preset].title : input.title;
  if (typeof title !== "string" || title.trim().length < 2 || title.trim().length > 32)
    throw new AppError("INVALID_ARGUMENT", "邀请标题需为2至32个字");
  const user = await findCurrentUser(context);
  const created = (await db.collection("playInvitations").add({
    data: {
      ownerId: user._id,
      ownerName: user.nickname || "一位球友",
      preset,
      title: title.trim(),
      line: PRESETS[preset].line,
      createdAt: db.serverDate(),
    },
  })) as { _id: string };
  return { id: created._id };
};

export const getInvitation: Handler = async (payload, context) => {
  const invite = await readInvitation(idFrom(payload));
  const replies = (await db
    .collection("playInvitationReplies")
    .where({ invitationId: invite._id })
    .limit(100)
    .get()) as unknown as { data: Reply[] };
  const counts = { YES: 0, MAYBE: 0, NO: 0 };
  for (const reply of replies.data) if (reply.choice in counts) counts[reply.choice] += 1;
  let mine: Choice | null = null;
  let isOwner = false;
  let people: Array<{ nickname: string; choice: Choice }> = [];
  if (context.openid) {
    try {
      const user = await findCurrentUser(context);
      mine = replies.data.find((reply) => reply.userId === user._id)?.choice ?? null;
      isOwner = user._id === invite.ownerId;
      if (isOwner)
        people = replies.data
          .filter((reply) => reply.choice !== "NO")
          .map(({ nickname, choice }) => ({ nickname, choice }));
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== "PROFILE_NOT_FOUND") throw error;
    }
  }
  return {
    invitation: {
      id: invite._id,
      ownerName: invite.ownerName,
      preset: invite.preset,
      title: invite.title,
      line: invite.line,
    },
    counts,
    mine,
    isOwner,
    people,
  };
};

export const replyInvitation: Handler = async (payload, context) => {
  const input = object(payload);
  const id = idFrom(input);
  if (input.choice !== "YES" && input.choice !== "MAYBE" && input.choice !== "NO")
    throw new AppError("INVALID_ARGUMENT", "请选择回应");
  await readInvitation(id);
  const user = await findCurrentUser(context);
  const replyId = createHash("sha256").update(`${id}:${user._id}`).digest("hex");
  const existing = (await db
    .collection("playInvitationReplies")
    .where({ _id: replyId })
    .limit(1)
    .get()) as unknown as { data: Reply[] };
  if (!existing.data[0]) {
    const total = (await db
      .collection("playInvitationReplies")
      .where({ invitationId: id })
      .count()) as { total: number };
    if (total.total >= 100)
      throw new AppError("INVITATION_FULL", "这张邀请卡已经收到100位球友的回应");
  }
  await db
    .collection("playInvitationReplies")
    .doc(replyId)
    .set({
      data: {
        invitationId: id,
        userId: user._id,
        nickname: user.nickname || "一位球友",
        choice: input.choice,
        updatedAt: db.serverDate(),
      },
    });
  return { choice: input.choice };
};
