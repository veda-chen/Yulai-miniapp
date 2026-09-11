import { describe, expect, it } from "vitest";
import { parseSubscriptionPreferences } from "./notification.js";

describe("subscription preferences", () => {
  it("accepts up to three known template results", () => {
    expect(
      parseSubscriptionPreferences({
        preferences: [
          {
            templateKey: "ACTIVITY_UPDATE",
            templateId: "template-id-activity-update",
            status: "accept",
          },
          {
            templateKey: "WAITLIST_PROMOTED",
            templateId: "template-id-waitlist",
            status: "reject",
          },
        ],
      }),
    ).toEqual([
      {
        templateKey: "ACTIVITY_UPDATE",
        templateId: "template-id-activity-update",
        status: "accept",
      },
      {
        templateKey: "WAITLIST_PROMOTED",
        templateId: "template-id-waitlist",
        status: "reject",
      },
    ]);
  });

  it("rejects unknown template types", () => {
    expect(() =>
      parseSubscriptionPreferences({
        preferences: [
          { templateKey: "UNKNOWN", templateId: "template-id-unknown", status: "accept" },
        ],
      }),
    ).toThrow("订阅模板类型无效");
  });

  it("rejects unsupported authorization states", () => {
    expect(() =>
      parseSubscriptionPreferences({
        preferences: [
          {
            templateKey: "ACTIVITY_CANCELLED",
            templateId: "template-id-cancelled",
            status: "granted",
          },
        ],
      }),
    ).toThrow("订阅授权状态无效");
  });
});
