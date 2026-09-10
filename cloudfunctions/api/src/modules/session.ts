import { db } from "../db.js";
import { hashOpenId } from "../identity.js";
import type { Handler } from "../types.js";

type UserDocument = {
  _id: string;
  openidHash: string;
};

export const getSession: Handler = async (_payload, context) => {
  if (!context.openid) {
    throw new Error("Authenticated route called without an openid");
  }
  const openidHash = hashOpenId(context.openid);
  const users = db.collection("users");
  const existing = (await users.where({ openidHash }).limit(1).get()) as unknown as {
    data: UserDocument[];
  };
  const user = existing.data[0];

  if (user) {
    return { user: { id: user._id, isNew: false } };
  }

  const now = db.serverDate();
  try {
    const created = (await users.add({
      data: {
        openidHash,
        nickname: null,
        avatarFileId: null,
        schoolId: null,
        level: "UNKNOWN",
        status: "ACTIVE",
        role: "USER",
        createdAt: now,
        updatedAt: now,
      },
    })) as { _id: string };

    return { user: { id: created._id, isNew: true } };
  } catch (error) {
    const concurrentlyCreated = (await users.where({ openidHash }).limit(1).get()) as unknown as {
      data: UserDocument[];
    };
    const racedUser = concurrentlyCreated.data[0];
    if (racedUser) {
      return { user: { id: racedUser._id, isNew: false } };
    }
    throw error;
  }
};
