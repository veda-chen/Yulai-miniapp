import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const activitySet = vi.fn(async () => ({}));
  const registrationSet = vi.fn(async () => ({}));
  const participantSet = vi.fn(async () => ({}));
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
        throw new Error(`Unexpected collection: ${name}`);
      },
    },
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

import { createActivity, criticalChangedFields, parseActivityInput } from "./activity.js";

beforeEach(() => {
  database.activitySet.mockClear();
  database.registrationSet.mockClear();
  database.participantSet.mockClear();
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
});
