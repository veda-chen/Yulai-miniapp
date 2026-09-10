import { describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  db: {
    collection: (name: string) => {
      if (name !== "activities") throw new Error("write should not be reached");
      return {
        where: () => ({
          limit: () => ({
            get: async () => ({
              data: [
                {
                  _id: "activity-1",
                  organizerId: "organizer",
                  status: "OPEN",
                  confirmedUserIds: ["member"],
                },
              ],
            }),
          }),
        }),
      };
    },
  },
}));
vi.mock("../db.js", () => database);
vi.mock("./user.js", () => ({
  findCurrentUser: async () => ({ _id: "outsider", status: "ACTIVE" }),
}));

import { setAttendance } from "./participation.js";

describe("attendance authorization", () => {
  it("only allows the organizer to change attendance", async () => {
    await expect(
      setAttendance(
        { activityId: "activity-1", userId: "member", attendanceStatus: "CHECKED_IN" },
        { requestId: "request-1", openid: "openid" },
      ),
    ).rejects.toThrow("只有组织者可以确认到场");
  });
});
