import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const activitySet = vi.fn(async () => ({}));
  const registrationSet = vi.fn(async () => ({}));
  const participantSet = vi.fn(async () => ({}));
  const registrations: unknown[] = [];
  const activities: unknown[] = [];
  const transactionCollection = (name: string) => {
    if (name === "activities") {
      return {
        where: () => ({ limit: () => ({ get: async () => ({ data: [] }) }) }),
        doc: () => ({ set: activitySet }),
      };
    }
    if (name === "registrations") return { doc: () => ({ set: registrationSet }) };
    if (name === "participants") return { doc: () => ({ set: participantSet }) };
    throw new Error(`Unexpected transaction collection: ${name}`);
  };
  return {
    activitySet,
    registrationSet,
    participantSet,
    db: {
      serverDate: () => "SERVER_DATE",
      runTransaction: async (callback: (transaction: unknown) => unknown) =>
        callback({ collection: transactionCollection }),
      command: {
        in: (values: string[]) => ({ in: values }),
        gt: (value: Date) => ({ gt: value }),
        inc: (value: number) => ({ inc: value }),
      },
      collection: (name: string) => {
        if (name === "venues") {
          return {
            where: () => ({
              limit: () => ({
                get: async () => ({
                  data: [{ _id: "venue-1", name: "测试球馆", status: "ACTIVE" }],
                }),
              }),
            }),
          };
        }
        if (name === "registrations") {
          return {
            where: () => ({ limit: () => ({ get: async () => ({ data: registrations }) }) }),
          };
        }
        if (name === "activities") {
          return {
            where: () => ({ limit: () => ({ get: async () => ({ data: activities }) }) }),
          };
        }
        throw new Error(`Unexpected collection: ${name}`);
      },
    },
    registrations,
    activities,
  };
});

vi.mock("../db.js", () => ({ db: database.db }));
vi.mock("./user.js", () => ({
  findCurrentUser: async () => ({
    _id: "user-1",
    nickname: "组织者",
    schoolId: null,
    status: "ACTIVE",
  }),
}));

import {
  createActivity,
  criticalChangedFields,
  isHistoricalActivity,
  listActivities,
  listMyActivities,
  parseActivityInput,
} from "./activity.js";

beforeEach(() => {
  database.activitySet.mockClear();
  database.registrationSet.mockClear();
  database.participantSet.mockClear();
  database.registrations.length = 0;
  database.activities.length = 0;
});

const valid = {
  venueId: "venue-1",
  startAt: "2026-09-10T11:00:00.000Z",
  endAt: "2026-09-10T13:00:00.000Z",
  registrationDeadline: "2026-09-10T09:00:00.000Z",
  capacity: 12,
};
const now = new Date("2026-09-09T00:00:00.000Z");

describe("parseActivityInput", () => {
  it("only marks decision-relevant fields as critical changes", () => {
    const current = { startAt: new Date("2099-01-01T10:00:00Z"), venueId: "v1", title: "旧标题" };
    const next = { startAt: "2099-01-01T10:00:00.000Z", venueId: "v2", title: "新标题" };
    expect(criticalChangedFields(current, next)).toEqual(["venueId"]);
  });
  it("applies public and optional-feature defaults", () => {
    expect(parseActivityInput(valid, now)).toMatchObject({
      visibility: "PUBLIC",
      contactVisibility: "PARTICIPANTS",
      groupingEnabled: false,
      scoringEnabled: false,
      level: "ANY",
    });
  });

  it("allows school-independent creation fields", () => {
    expect(parseActivityInput(valid, now)).not.toHaveProperty("schoolId");
  });

  it("recognizes past participation while excluding cancelled activities", () => {
    expect(
      isHistoricalActivity(
        { status: "OPEN", startAt: "2026-09-08T11:00:00.000Z" },
        new Date("2026-09-09T00:00:00.000Z"),
      ),
    ).toBe(true);
    expect(
      isHistoricalActivity(
        { status: "CANCELLED", startAt: "2026-09-08T11:00:00.000Z" },
        new Date("2026-09-09T00:00:00.000Z"),
      ),
    ).toBe(false);
  });

  it("rejects a deadline after the start", () => {
    expect(() =>
      parseActivityInput({ ...valid, registrationDeadline: "2026-09-10T12:00:00.000Z" }, now),
    ).toThrow("报名截止时间不能晚于开始时间");
  });

  it("rejects capacities outside 4 to 40", () => {
    expect(() => parseActivityInput({ ...valid, capacity: 3 }, now)).toThrow("人数上限需为4至40人");
  });

  it("creates a public activity without requiring a school", async () => {
    const result = await createActivity(
      {
        ...valid,
        startAt: "2099-09-10T11:00:00.000Z",
        endAt: "2099-09-10T13:00:00.000Z",
        registrationDeadline: "2099-09-10T09:00:00.000Z",
        idempotencyKey: "request-1",
      },
      { requestId: "request-1", openid: "openid-1" },
    );

    expect(database.activitySet).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizerId: "user-1",
        visibility: "PUBLIC",
        groupingEnabled: false,
        scoringEnabled: false,
        registeredCount: 1,
        waitlistCount: 0,
        confirmedUserIds: ["user-1"],
        waitlistUserIds: [],
        nextQueueNo: 2,
      }),
    });
    expect(database.registrationSet).toHaveBeenCalledWith({
      data: expect.objectContaining({
        activityId: expect.any(String),
        userId: "user-1",
        nickname: "组织者",
        status: "CONFIRMED",
        queueNo: 1,
      }),
    });
    expect(database.participantSet).toHaveBeenCalledWith({
      data: expect.objectContaining({
        activityId: expect.any(String),
        userId: "user-1",
        status: "ACTIVE",
        attendanceStatus: "PENDING",
      }),
    });
    expect(result).toMatchObject({
      activity: { id: expect.any(String), isOrganizer: true, registeredCount: 1 },
    });
  });

  it("lists private and in-progress activities for the current participant", async () => {
    database.registrations.push(
      { activityId: "link-only", status: "CONFIRMED" },
      { activityId: "playing", status: "WAITLISTED" },
      { activityId: "cancelled", status: "CONFIRMED" },
    );
    const baseActivity = {
      organizerId: "other-user",
      organizerName: "组织者",
      venueId: "venue-1",
      venueName: "测试球馆",
      startAt: "2099-01-01T10:00:00.000Z",
      endAt: "2099-01-01T12:00:00.000Z",
      registrationDeadline: "2099-01-01T09:00:00.000Z",
      capacity: 8,
      registeredCount: 4,
      waitlistCount: 0,
      level: "ANY",
      locationHint: null,
      feeNote: null,
      contact: null,
      contactVisibility: "PARTICIPANTS",
      details: null,
      visibility: "LINK_ONLY",
      groupingEnabled: false,
      scoringEnabled: false,
      version: 1,
      changeVersion: 0,
    };
    database.activities.push(
      { ...baseActivity, _id: "link-only", title: "仅链接球局", status: "OPEN" },
      { ...baseActivity, _id: "playing", title: "进行中球局", status: "IN_PROGRESS" },
      { ...baseActivity, _id: "cancelled", title: "取消球局", status: "CANCELLED" },
    );

    const result = (await listMyActivities(
      { limit: 10 },
      { requestId: "mine-1", openid: "openid-1" },
    )) as { activities: Array<{ id: string; currentRegistrationStatus: string }> };

    expect(result.activities.map((activity) => activity.id)).toEqual(["link-only", "playing"]);
    expect(result.activities.map((activity) => activity.currentRegistrationStatus)).toEqual([
      "CONFIRMED",
      "WAITLISTED",
    ]);
  });

  it("rejects oversized activity pages before querying the database", async () => {
    await expect(
      listActivities({ limit: 51 }, { requestId: "page-1", openid: "openid-1" }),
    ).rejects.toThrow("分页参数无效");
  });
});
