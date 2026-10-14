import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => {
  const jobs = new Map<string, Record<string, unknown>>();
  const preferences = new Map<string, Record<string, unknown>>();
  const activities = new Map<string, Record<string, unknown>>();
  const send = vi.fn(async () => ({ errCode: 0 }));
  let failSentUpdate = false;
  let transactionTail = Promise.resolve();

  function collection(name: string) {
    const records =
      name === "notificationJobs"
        ? jobs
        : name === "subscriptionPreferences"
          ? preferences
          : activities;
    return {
      where(filter: Record<string, unknown>) {
        let selected = [...records.values()].filter((record) =>
          Object.entries(filter).every(([field, expected]) => {
            const actual = record[field];
            if (typeof expected === "object" && expected !== null && "lte" in expected)
              return (
                new Date(actual as string).getTime() <= new Date(expected.lte as Date).getTime()
              );
            return actual === expected;
          }),
        );
        const query = {
          orderBy(field: string) {
            selected = [...selected].sort(
              (a, b) =>
                new Date(a[field] as string).getTime() - new Date(b[field] as string).getTime(),
            );
            return query;
          },
          limit(count: number) {
            return { get: async () => ({ data: selected.slice(0, count) }) };
          },
        };
        return query;
      },
      doc(id: string) {
        return {
          async update({ data }: { data: Record<string, unknown> }) {
            if (
              name === "notificationJobs" &&
              data.subscriptionStatus === "SENT" &&
              failSentUpdate
            ) {
              failSentUpdate = false;
              throw new Error("status write failed");
            }
            records.set(id, { ...records.get(id), ...data });
          },
        };
      },
    };
  }

  return {
    jobs,
    preferences,
    activities,
    send,
    collection,
    failNextSentUpdate() {
      failSentUpdate = true;
    },
    reset() {
      jobs.clear();
      preferences.clear();
      activities.clear();
      send.mockClear();
      failSentUpdate = false;
      transactionTail = Promise.resolve();
    },
    async runTransaction(
      callback: (transaction: { collection: typeof collection }) => Promise<unknown>,
    ) {
      const previous = transactionTail;
      let release: () => void = () => undefined;
      transactionTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await callback({ collection });
      } finally {
        release();
      }
    },
  };
});

vi.mock("../db.js", () => ({
  cloud: { openapi: { subscribeMessage: { send: fixture.send } } },
  db: {
    collection: fixture.collection,
    command: { lte: (value: Date) => ({ lte: value }) },
    runTransaction: fixture.runTransaction,
    serverDate: () => new Date(),
  },
}));
vi.mock("../identity.js", () => ({
  decryptSubscriptionOpenId: () => "openid-1",
  encryptSubscriptionOpenId: () => "encrypted",
}));

import { processPendingSubscriptionMessages, SUBSCRIPTION_TEMPLATE_IDS } from "./notification.js";

beforeEach(() => {
  fixture.reset();
  fixture.jobs.set("job-1", {
    _id: "job-1",
    userId: "user-1",
    activityId: "activity-1",
    subscriptionTemplateKey: "ACTIVITY_UPDATE",
    subscriptionStatus: "PENDING",
    subscriptionAttempts: 0,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  });
  fixture.preferences.set("preference-1", {
    _id: "preference-1",
    userId: "user-1",
    templateId: SUBSCRIPTION_TEMPLATE_IDS.ACTIVITY_UPDATE,
    status: "accept",
    recipientOpenIdEncrypted: "encrypted",
  });
  fixture.activities.set("activity-1", {
    _id: "activity-1",
    title: "测试球局",
    startAt: "2099-01-01T10:00:00Z",
    venueName: "测试场馆",
  });
});

describe("subscription worker", () => {
  it("claims one pending job only once across concurrent workers", async () => {
    const [first, second] = await Promise.all([
      processPendingSubscriptionMessages(),
      processPendingSubscriptionMessages(),
    ]);
    expect(first.processed + second.processed).toBe(1);
    expect(fixture.send).toHaveBeenCalledTimes(1);
    expect(fixture.jobs.get("job-1")?.subscriptionStatus).toBe("SENT");
  });

  it("requires verification instead of resending after platform acceptance and a status-write failure", async () => {
    fixture.failNextSentUpdate();
    await processPendingSubscriptionMessages();
    expect(fixture.jobs.get("job-1")?.subscriptionStatus).toBe("VERIFY_REQUIRED");
    await processPendingSubscriptionMessages();
    expect(fixture.send).toHaveBeenCalledTimes(1);
  });
});
