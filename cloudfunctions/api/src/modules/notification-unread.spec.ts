import { describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const where = vi.fn((_query: unknown) => ({
    limit: () => ({ get: async () => ({ data: [{ _id: "notice-1" }] }) }),
  }));
  return {
    where,
    db: { collection: () => ({ where }) },
  };
});

vi.mock("../db.js", () => ({ cloud: {}, db: database.db }));
vi.mock("./user.js", () => ({ findCurrentUser: async () => ({ _id: "user-1" }) }));

import { getUnreadNotificationSummary } from "./notification.js";

describe("getUnreadNotificationSummary", () => {
  it("checks unread notifications for the current account only", async () => {
    await expect(
      getUnreadNotificationSummary({}, { requestId: "request-1", openid: "openid-1" }),
    ).resolves.toEqual({ hasUnread: true });
    expect(database.where).toHaveBeenCalledWith({ userId: "user-1", status: "READY" });
  });
});
