import { describe, expect, it, vi } from "vitest";

vi.mock("../db.js", () => ({
  cloud: { deleteFile: async () => ({}) },
  db: {
    collection: () => {
      throw new Error("database should not be reached");
    },
  },
}));
vi.mock("./user.js", () => ({
  findCurrentUser: async () => ({ _id: "user-1", role: "USER", status: "ACTIVE" }),
}));

import { getAdminDashboard, listAuditLogs, parseVenueUpdate } from "./admin.js";

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

describe("venue administration input", () => {
  it("parses partial venue data and clears optional fields", () => {
    expect(
      parseVenueUpdate({
        id: "venue-1",
        entranceGuide: " 体育馆东门 ",
        contactPhone: "",
        facilities: ["洗手间", "更衣室"],
      }),
    ).toEqual({
      id: "venue-1",
      update: {
        entranceGuide: "体育馆东门",
        contactPhone: null,
        facilities: ["洗手间", "更衣室"],
      },
    });
  });

  it("accepts only image paths owned by the selected venue", () => {
    expect(
      parseVenueUpdate({
        id: "venue-1",
        floorPlanFileId: "cloud://env.example/venues/venue-1/floorPlanFileId/plan.jpg",
      }).update.floorPlanFileId,
    ).toBe("cloud://env.example/venues/venue-1/floorPlanFileId/plan.jpg");
    expect(() =>
      parseVenueUpdate({
        id: "venue-1",
        floorPlanFileId: "cloud://env.example/venues/venue-2/floorPlanFileId/plan.jpg",
      }),
    ).toThrow("场馆图片文件无效");
  });

  it("rejects unknown venue fields", () => {
    expect(() => parseVenueUpdate({ id: "venue-1", ownerId: "user-1" })).toThrow("不支持修改字段");
  });
});
