import { beforeAll, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const update = vi.fn(async () => ({ stats: { updated: 1 } }));
  const currentUser = {
    _id: "user-1",
    openidHash: "stored-hash",
    nickname: "小羽",
    avatarFileId: null,
    schoolId: "school-1",
    level: "BEGINNER",
    status: "ACTIVE",
  };
  return {
    update,
    db: {
      serverDate: () => "SERVER_DATE",
      collection: (name: string) => {
        if (name !== "users") throw new Error(`Unexpected collection: ${name}`);
        return {
          where: () => ({ limit: () => ({ get: async () => ({ data: [currentUser] }) }) }),
          doc: () => ({ update }),
        };
      },
    },
  };
});

vi.mock("../db.js", () => ({ db: database.db }));

import { parseProfileUpdate, updateMe } from "./user.js";

beforeAll(() => {
  process.env.OPENID_HASH_SECRET = "test-secret-that-is-at-least-32-characters";
});

describe("parseProfileUpdate", () => {
  it("allows a school to be cleared", () => {
    expect(parseProfileUpdate({ schoolId: null })).toEqual({ schoolId: null });
  });

  it("trims a valid nickname and accepts the unknown level", () => {
    expect(parseProfileUpdate({ nickname: "  小羽  ", level: "UNKNOWN" })).toEqual({
      nickname: "小羽",
      level: "UNKNOWN",
    });
  });

  it("rejects unsupported fields", () => {
    expect(() => parseProfileUpdate({ role: "ADMIN" })).toThrow("不支持修改字段");
  });

  it("rejects an empty nickname", () => {
    expect(() => parseProfileUpdate({ nickname: "   " })).toThrow("昵称需为1至24个字符");
  });

  it("requires null rather than an empty school id when clearing", () => {
    expect(() => parseProfileUpdate({ schoolId: "" })).toThrow("学校选择无效");
  });

  it("persists a cleared school without looking up a school", async () => {
    const result = await updateMe(
      { nickname: "小羽", schoolId: null, level: "BEGINNER" },
      { requestId: "request-1", openid: "openid-1" },
    );

    expect(database.update).toHaveBeenCalledWith({
      data: {
        nickname: "小羽",
        schoolId: null,
        level: "BEGINNER",
        updatedAt: "SERVER_DATE",
      },
    });
    expect(result).toMatchObject({ user: { school: null, needsProfile: false } });
  });
});
