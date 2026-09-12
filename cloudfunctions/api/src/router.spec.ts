import { describe, expect, it } from "vitest";
import { resolveRoute } from "./router.js";

describe("resolveRoute", () => {
  it("resolves the M1 health route", () => {
    expect(resolveRoute("health.get")).toMatchObject({ requiresAuth: false });
  });

  it("marks profile writes as authenticated and venue reads as public", () => {
    expect(resolveRoute("user.updateMe")).toMatchObject({ requiresAuth: true });
    expect(resolveRoute("user.deleteMe")).toMatchObject({ requiresAuth: true });
    expect(resolveRoute("venue.list")).toMatchObject({ requiresAuth: false });
  });

  it("requires authentication for activity writes", () => {
    expect(resolveRoute("activity.list")).toMatchObject({ requiresAuth: false });
    expect(resolveRoute("activity.history")).toMatchObject({ requiresAuth: true });
    expect(resolveRoute("activity.get")).toMatchObject({ requiresAuth: false });
    expect(resolveRoute("activity.create")).toMatchObject({ requiresAuth: true });
    expect(resolveRoute("activity.update")).toMatchObject({ requiresAuth: true });
    expect(resolveRoute("registration.join")).toMatchObject({ requiresAuth: true });
    expect(resolveRoute("registration.leave")).toMatchObject({ requiresAuth: true });
    expect(resolveRoute("activity.cancel")).toMatchObject({ requiresAuth: true });
    expect(resolveRoute("activity.ackChange")).toMatchObject({ requiresAuth: true });
    expect(resolveRoute("participant.setAttendance")).toMatchObject({ requiresAuth: true });
    expect(resolveRoute("live.get")).toMatchObject({ requiresAuth: true });
    expect(resolveRoute("grouping.generate")).toMatchObject({ requiresAuth: true });
    expect(resolveRoute("grouping.update")).toMatchObject({ requiresAuth: true });
    expect(resolveRoute("score.submit")).toMatchObject({ requiresAuth: true });
    expect(resolveRoute("score.lock")).toMatchObject({ requiresAuth: true });
    expect(resolveRoute("notification.list")).toMatchObject({ requiresAuth: true });
    expect(resolveRoute("report.create")).toMatchObject({ requiresAuth: true });
    expect(resolveRoute("admin.report.resolve")).toMatchObject({ requiresAuth: true });
  });

  it("rejects unknown actions", () => {
    expect(() => resolveRoute("unknown.action")).toThrow("请求的操作不存在");
  });
});
