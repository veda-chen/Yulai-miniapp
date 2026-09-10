import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const state = { status: "ACTIVE" };
  return {
    state,
    db: {
      serverDate: () => "SERVER_DATE",
      collection: () => ({
        where: () => ({
          limit: () => ({
            get: async () => ({
              data: [{ _id: "user-1", openidHash: "stored-hash", status: state.status }],
            }),
          }),
        }),
      }),
    },
  };
});

vi.mock("../db.js", () => ({ db: database.db }));
import { getSession } from "./session.js";

beforeAll(() => {
  process.env.OPENID_HASH_SECRET = "test-secret-that-is-at-least-32-characters";
});
beforeEach(() => {
  database.state.status = "ACTIVE";
});

describe("getSession", () => {
  it("returns an existing active account", async () => {
    await expect(
      getSession(undefined, { requestId: "request-1", openid: "openid-1" }),
    ).resolves.toEqual({
      user: { id: "user-1", isNew: false },
    });
  });

  it("blocks a deleted account from being recreated automatically", async () => {
    database.state.status = "DELETED";
    await expect(
      getSession(undefined, { requestId: "request-1", openid: "openid-1" }),
    ).rejects.toThrow("账号已注销");
  });
});
