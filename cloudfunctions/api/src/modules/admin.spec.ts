import { describe, expect, it, vi } from "vitest";

vi.mock("../db.js", () => ({
  db: {
    collection: () => {
      throw new Error("database should not be reached");
    },
  },
}));
vi.mock("./user.js", () => ({
  findCurrentUser: async () => ({ _id: "user-1", role: "USER", status: "ACTIVE" }),
}));

import { getAdminDashboard, listAuditLogs } from "./admin.js";

describe("admin authorization", () => {
  it("rejects ordinary users before reading operational data", async () => {
    await expect(
      getAdminDashboard(undefined, { requestId: "request-1", openid: "openid" }),
    ).rejects.toThrow("需要管理员权限");
  });

  it("rejects ordinary users before reading audit logs", async () => {
    await expect(
      listAuditLogs(undefined, { requestId: "request-2", openid: "openid" }),
    ).rejects.toThrow("需要管理员权限");
  });
});
