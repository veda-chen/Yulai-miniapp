import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => {
  const documents: Record<string, Map<string, Record<string, unknown>>> = {
    activities: new Map(),
    registrations: new Map(),
    participants: new Map(),
    auditLogs: new Map(),
    notificationJobs: new Map(),
  };
  let currentUser = { _id: "user-1", nickname: "一号", status: "ACTIVE" };
  let transactionTail: Promise<void> = Promise.resolve();

  function collection(name: string) {
    const values = documents[name];
    if (!values) throw new Error(`Unexpected collection: ${name}`);
    return {
      doc(id: string) {
        return {
          async set({ data }: { data: Record<string, unknown> }) {
            values.set(id, { _id: id, ...data });
          },
          async update({ data }: { data: Record<string, unknown> }) {
            const current = values.get(id);
            if (!current) throw new Error(`Missing document: ${name}/${id}`);
            values.set(id, { ...current, ...data });
          },
        };
      },
      where(query: Record<string, unknown>) {
        return {
          limit() {
            return {
              async get() {
                return {
                  data: [...values.values()].filter((value) =>
                    Object.entries(query).every(([key, expected]) => value[key] === expected),
                  ),
                };
              },
            };
          },
        };
      },
      async add({ data }: { data: Record<string, unknown> }) {
        const id = `audit-${values.size + 1}`;
        values.set(id, { _id: id, ...data });
        return { _id: id };
      },
    };
  }

  return {
    documents,
    collection,
    getCurrentUser: () => currentUser,
    setCurrentUser(user: typeof currentUser) {
      currentUser = user;
    },
    async runTransaction(callback: (transaction: unknown) => Promise<unknown>) {
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
    resetTransactionQueue() {
      transactionTail = Promise.resolve();
    },
  };
});

vi.mock("../db.js", () => ({
  db: {
    collection: fixture.collection,
    serverDate: () => new Date("2026-09-09T05:00:00.000Z"),
    runTransaction: fixture.runTransaction,
  },
}));

vi.mock("./user.js", () => ({
  findCurrentUser: async (context: { openid?: string }) =>
    context.openid?.startsWith("concurrent-user-")
      ? { _id: context.openid, nickname: context.openid, status: "ACTIVE" }
      : fixture.getCurrentUser(),
}));

import { joinRegistration, leaveRegistration } from "./registration.js";

beforeEach(() => {
  for (const documents of Object.values(fixture.documents)) documents.clear();
  fixture.resetTransactionQueue();
  fixture.setCurrentUser({ _id: "user-1", nickname: "一号", status: "ACTIVE" });
  fixture.documents.activities?.set("activity-1", {
    _id: "activity-1",
    capacity: 1,
    status: "OPEN",
    registrationDeadline: new Date("2099-09-10T00:00:00.000Z"),
    confirmedUserIds: [],
    waitlistUserIds: [],
    nextQueueNo: 1,
  });
});

describe("registration transaction", () => {
  it("serializes 100 concurrent attempts without exceeding capacity", async () => {
    await Promise.all(
      Array.from({ length: 100 }, (_, index) =>
        joinRegistration(
          { activityId: "activity-1", idempotencyKey: `join-${index}` },
          { requestId: `request-${index}`, openid: `concurrent-user-${index}` },
        ),
      ),
    );

    expect(fixture.documents.activities?.get("activity-1")).toMatchObject({
      registeredCount: 1,
      waitlistCount: 99,
    });
    expect(fixture.documents.registrations?.size).toBe(100);
  });

  it("confirms one user, waitlists the next, and keeps retries idempotent", async () => {
    const context = { requestId: "request-1", openid: "openid" };
    const first = await joinRegistration(
      { activityId: "activity-1", idempotencyKey: "join-user-1" },
      context,
    );
    const retry = await joinRegistration(
      { activityId: "activity-1", idempotencyKey: "join-user-1" },
      context,
    );
    fixture.setCurrentUser({ _id: "user-2", nickname: "二号", status: "ACTIVE" });
    const second = await joinRegistration(
      { activityId: "activity-1", idempotencyKey: "join-user-2" },
      context,
    );

    expect(first).toMatchObject({ registration: { status: "CONFIRMED" } });
    expect(retry).toMatchObject({ registration: { status: "CONFIRMED" } });
    expect(second).toMatchObject({
      registration: { status: "WAITLISTED", waitlistPosition: 1 },
    });
    expect(fixture.documents.activities?.get("activity-1")).toMatchObject({
      registeredCount: 1,
      waitlistCount: 1,
      confirmedUserIds: ["user-1"],
      waitlistUserIds: ["user-2"],
    });
  });

  it("promotes the first waitlisted user when a member leaves before the deadline", async () => {
    const context = { requestId: "request-1", openid: "openid" };
    await joinRegistration({ activityId: "activity-1", idempotencyKey: "join-1" }, context);
    fixture.setCurrentUser({ _id: "user-2", nickname: "二号", status: "ACTIVE" });
    await joinRegistration({ activityId: "activity-1", idempotencyKey: "join-2" }, context);
    fixture.setCurrentUser({ _id: "user-1", nickname: "一号", status: "ACTIVE" });

    const result = await leaveRegistration(
      { activityId: "activity-1", idempotencyKey: "leave-1" },
      context,
    );

    expect(result).toMatchObject({ registration: { promotedUserId: "user-2" } });
    expect(fixture.documents.activities?.get("activity-1")).toMatchObject({
      registeredCount: 1,
      waitlistCount: 0,
      confirmedUserIds: ["user-2"],
      waitlistUserIds: [],
    });
    expect([...(fixture.documents.participants?.values() ?? [])]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: "user-1", status: "WITHDRAWN" }),
        expect.objectContaining({ userId: "user-2", status: "ACTIVE" }),
      ]),
    );
  });

  it("does not let the organizer leave their own activity", async () => {
    fixture.documents.activities?.set("activity-1", {
      ...fixture.documents.activities.get("activity-1"),
      organizerId: "user-1",
      confirmedUserIds: ["user-1"],
      registeredCount: 1,
      nextQueueNo: 2,
    });

    await expect(
      leaveRegistration(
        { activityId: "activity-1", idempotencyKey: "leave-organizer" },
        { requestId: "request-1", openid: "openid" },
      ),
    ).rejects.toMatchObject({
      code: "ORGANIZER_CANNOT_LEAVE",
      message: "组织者已计入活动人数，取消球局后才能退出",
    });
  });
});
