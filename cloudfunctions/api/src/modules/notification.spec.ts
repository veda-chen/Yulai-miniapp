import { describe, expect, it } from "vitest";
import {
  buildSubscriptionData,
  isSubscriptionDeliveryTimerEvent,
  parseSubscriptionPreferences,
  SUBSCRIPTION_DELIVERY_TRIGGER_NAME,
} from "./notification.js";

describe("subscription preferences", () => {
  it("accepts up to three known template results", () => {
    expect(
      parseSubscriptionPreferences({
        preferences: [
          {
            templateKey: "ACTIVITY_UPDATE",
            templateId: "cqCZYss6j--bOHkYnZs2VEJoxE6mBK6ifpuocdagg0A",
            status: "accept",
          },
          {
            templateKey: "WAITLIST_PROMOTED",
            templateId: "SH-jFRByW81RL-m1nmw294VxYQ8Fota5ysyGd4XMgkM",
            status: "reject",
          },
        ],
      }),
    ).toEqual([
      {
        templateKey: "ACTIVITY_UPDATE",
        templateId: "cqCZYss6j--bOHkYnZs2VEJoxE6mBK6ifpuocdagg0A",
        status: "accept",
      },
      {
        templateKey: "WAITLIST_PROMOTED",
        templateId: "SH-jFRByW81RL-m1nmw294VxYQ8Fota5ysyGd4XMgkM",
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
            templateId: "cqCZYss6j--bOHkYnZs2VEJoxE6mBK6ifpuocdagg0A",
            status: "granted",
          },
        ],
      }),
    ).toThrow("订阅授权状态无效");
  });

  it("rejects a template id that is not configured for the selected event", () => {
    expect(() =>
      parseSubscriptionPreferences({
        preferences: [
          { templateKey: "ACTIVITY_UPDATE", templateId: "template-id-unknown", status: "accept" },
        ],
      }),
    ).toThrow("订阅模板编号无效");
  });
});

describe("subscription message mapping", () => {
  const activity = {
    title: "周六晚广东工业大学大学城校区羽毛球局",
    startAt: "2026-09-12T11:30:00.000Z",
    venueName: "广东工业大学大学城校区体育馆",
    cancelReason: "场馆临时停止开放",
  };

  it("maps the shared change template with its exact keyword ids", () => {
    expect(buildSubscriptionData("ACTIVITY_UPDATE", activity)).toEqual({
      thing6: { value: "周六晚广东工业大学大学城校区羽毛球局" },
      time10: { value: "2026年09月12日 19:30" },
      thing2: { value: "广东工业大学大学城校区体育馆" },
      thing13: { value: "已变更" },
      thing24: { value: "球局时间、地点或人数有调整" },
    });
  });

  it("maps cancellation and waitlist promotion to their exact keyword ids", () => {
    expect(buildSubscriptionData("ACTIVITY_CANCELLED", activity).thing24).toEqual({
      value: "场馆临时停止开放",
    });
    expect(buildSubscriptionData("WAITLIST_PROMOTED", activity)).toMatchObject({
      thing1: { value: "周六晚广东工业大学大学城校区羽毛球局" },
      time18: { value: "2026年09月12日 19:30" },
      thing8: { value: "候补递补成功" },
    });
  });

  it("recognizes only the subscription delivery timer", () => {
    expect(
      isSubscriptionDeliveryTimerEvent({
        Type: "Timer",
        TriggerName: SUBSCRIPTION_DELIVERY_TRIGGER_NAME,
      }),
    ).toBe(true);
    expect(isSubscriptionDeliveryTimerEvent({ Type: "Timer", TriggerName: "other" })).toBe(false);
  });
});
