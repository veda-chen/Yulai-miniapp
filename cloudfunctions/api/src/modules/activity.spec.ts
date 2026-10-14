import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const activitySet = vi.fn(async () => ({}));
  const registrationSet = vi.fn(async () => ({}));
  const participantSet = vi.fn(async () => ({}));
  const registrations: unknown[] = [];
  const activities: unknown[] = [];
  let transactionFreshActivity: unknown = null;
  const activityQueries: Array<Record<string, unknown>> = [];
  const transactionCollection = (name: string) => {
    if (name === "activities") {
      return {
        where: () => ({
          limit: () => ({
            get: async () => ({ data: transactionFreshActivity ? [transactionFreshActivity] : [] }),
          }),
        }),
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
        gt: (value: Date) => ({ gt: value, and: (other: object) => ({ gt: value, ...other }) }),
        gte: (value: Date) => ({ gte: value, and: (other: object) => ({ gte: value, ...other }) }),
        lt: (value: Date) => ({ lt: value }),
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
          let selected = registrations;
          const query = {
            skip: (count: number) => {
              selected = selected.slice(count);
              return query;
            },
            limit: (count: number) => ({ get: async () => ({ data: selected.slice(0, count) }) }),
          };
          return {
            where: () => query,
          };
        }
        if (name === "activities") {
          return {
            where: (filter: Record<string, unknown>) => {
              activityQueries.push(filter);
              let selected = (activities as Array<Record<string, unknown>>).filter((activity) =>
                Object.entries(filter).every(([key, expected]) => {
                  if (
                    typeof expected === "object" &&
                    expected !== null &&
                    "gt" in expected &&
                    new Date(activity[key] as string).getTime() <=
                      new Date(expected.gt as Date).getTime()
                  )
                    return false;
                  if (
                    typeof expected === "object" &&
                    expected !== null &&
                    "gte" in expected &&
                    new Date(activity[key] as string).getTime() <
                      new Date(expected.gte as Date).getTime()
                  )
                    return false;
                  if (
                    typeof expected === "object" &&
                    expected !== null &&
                    "lt" in expected &&
                    new Date(activity[key] as string).getTime() >=
                      new Date(expected.lt as Date).getTime()
                  )
                    return false;
                  if (
                    typeof expected === "object" &&
                    expected !== null &&
                    ("gt" in expected || "gte" in expected || "lt" in expected)
                  )
                    return true;
                  if (typeof expected === "object" && expected !== null && "in" in expected)
                    return (expected.in as unknown[]).includes(activity[key]);
                  return activity[key] === expected;
                }),
              );
              const query = {
                count: async () => ({ total: selected.length }),
                orderBy: (key: string, direction: string) => {
                  selected = [...selected].sort(
                    (a, b) =>
                      (new Date(a[key] as string).getTime() -
                        new Date(b[key] as string).getTime()) *
                      (direction === "desc" ? -1 : 1),
                  );
                  return query;
                },
                skip: (count: number) => {
                  selected = selected.slice(count);
                  return query;
                },
                limit: (count: number) => ({
                  get: async () => ({ data: selected.slice(0, count) }),
                }),
              };
              return query;
            },
          };
        }
        throw new Error(`Unexpected collection: ${name}`);
      },
    },
    registrations,
    activities,
    activityQueries,
    setTransactionFreshActivity: (value: unknown) => {
      transactionFreshActivity = value;
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

import {
  createActivity,
  criticalChangedFields,
  getLatestCreatedActivity,
  isHistoricalActivity,
  listActivities,
  listMyActivities,
  getMyActivitySummary,
  canViewActivityContact,
  parseActivityInput,
  updateActivity,
} from "./activity.js";

beforeEach(() => {
  database.activitySet.mockClear();
  database.registrationSet.mockClear();
  database.participantSet.mockClear();
  database.registrations.length = 0;
  database.activities.length = 0;
  database.activityQueries.length = 0;
  database.setTransactionFreshActivity(null);
});

const valid = {
  venueId: "venue-1",
  title: "周五晚羽毛球局",
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

  it("requires a recognizable activity name", () => {
    expect(() => parseActivityInput({ ...valid, title: "   " }, now)).toThrow("球局名称格式不正确");
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

function sampleActivity(index: number, changes: Record<string, unknown> = {}) {
  return {
    _id: `game-${index}`,
    organizerId: "user-2",
    organizerName: "发起人",
    venueId: "venue-1",
    venueName: "测试球馆",
    title: `球局 ${index}`,
    startAt: new Date(Date.UTC(2099, 0, 1, 10, 0) + index * 60_000),
    endAt: new Date(Date.UTC(2099, 0, 1, 12, 0) + index * 60_000),
    registrationDeadline: new Date(Date.UTC(2099, 0, 1, 9, 0) + index * 60_000),
    capacity: 8,
    registeredCount: 4,
    waitlistCount: 0,
    level: "ANY",
    status: "OPEN",
    visibility: "PUBLIC",
    locationHint: null,
    feeNote: null,
    contact: null,
    contactVisibility: "NONE",
    details: null,
    groupingEnabled: false,
    scoringEnabled: false,
    version: 1,
    createdAt: new Date(Date.UTC(2098, 0, 1) + index * 60_000),
    ...changes,
  };
}

describe("activity privacy and capacity", () => {
  it("hides participant-only contacts from waitlisted and withdrawn users", () => {
    for (const status of [null, "WAITLISTED", "WITHDRAWN", "CANCELLED"])
      expect(canViewActivityContact("PARTICIPANTS", false, status)).toBe(false);
    for (const status of ["CONFIRMED", "ATTENDED", "NO_SHOW"])
      expect(canViewActivityContact("PARTICIPANTS", false, status)).toBe(true);
    expect(canViewActivityContact("NONE", false, "CONFIRMED")).toBe(false);
    expect(canViewActivityContact("NONE", true, null)).toBe(true);
    expect(canViewActivityContact("PUBLIC", false, null)).toBe(true);
  });

  it("rechecks the latest confirmed count inside a capacity update transaction", async () => {
    const original = sampleActivity(1, { organizerId: "user-1", capacity: 8, registeredCount: 2 });
    database.activities.push(original);
    database.setTransactionFreshActivity({ ...original, registeredCount: 5 });
    await expect(
      updateActivity(
        {
          ...valid,
          id: original._id,
          version: 1,
          startAt: "2099-01-01T10:00:00.000Z",
          endAt: "2099-01-01T12:00:00.000Z",
          registrationDeadline: "2099-01-01T09:00:00.000Z",
          capacity: 4,
        },
        { requestId: "update-1", openid: "openid-1" },
      ),
    ).rejects.toThrow("人数上限不能低于当前报名人数");
  });

  it("counts private upcoming and organizing activities without a public-list limit", async () => {
    database.registrations.push({ activityId: "link-only", status: "CONFIRMED" });
    database.activities.push(
      sampleActivity(1, { _id: "link-only", visibility: "LINK_ONLY" }),
      sampleActivity(2, { _id: "organizing", organizerId: "user-1", status: "IN_PROGRESS" }),
    );
    await expect(
      getMyActivitySummary(undefined, { requestId: "summary-1", openid: "openid-1" }),
    ).resolves.toEqual({ upcomingCount: 1, organizingCount: 1 });
  });
});

describe("activity discovery", () => {
  const context = { requestId: "discovery", openid: "openid-1" };

  it("combines date, venue, level, keyword and remaining spots before pagination", async () => {
    database.activities.push(
      sampleActivity(1, { venueId: "other" }),
      sampleActivity(2, { level: "CASUAL" }),
      sampleActivity(3, { registeredCount: 8 }),
      sampleActivity(4, { title: "其他活动", level: "IMPROVING" }),
      sampleActivity(5, { title: "周五进阶局", level: "IMPROVING" }),
    );
    const result = (await listActivities(
      {
        limit: 1,
        venueId: "venue-1",
        level: "IMPROVING",
        keyword: "周五",
        hasSpots: true,
        startAtFrom: "2099-01-01T10:00:00.000Z",
        startAtBefore: "2099-01-01T11:00:00.000Z",
      },
      context,
    )) as { activities: Array<{ id: string }>; nextOffset: number | null };
    expect(result.activities.map((activity) => activity.id)).toEqual(["game-5"]);
    expect(database.activityQueries[0]).toMatchObject({ venueId: "venue-1", level: "IMPROVING" });
    expect(database.activityQueries[0]?.startAt).toMatchObject({
      gte: new Date("2099-01-01T10:00:00.000Z"),
      lt: new Date("2099-01-01T11:00:00.000Z"),
    });
  });

  it("continues past a full unmatched batch without claiming no results", async () => {
    for (let index = 0; index < 120; index += 1) database.activities.push(sampleActivity(index));
    database.activities.push(sampleActivity(120, { title: "特别球局" }));
    const result = (await listActivities({ limit: 1, keyword: "特别" }, context)) as {
      activities: Array<{ id: string }>;
      nextOffset: number | null;
    };
    expect(result.activities.map((activity) => activity.id)).toEqual(["game-120"]);
    expect(result.nextOffset).toBeNull();
  });

  it("returns a continuation cursor when the scan cap ends on unmatched records", async () => {
    for (let index = 0; index < 550; index += 1) database.activities.push(sampleActivity(index));
    const first = (await listActivities({ limit: 1, keyword: "特别" }, context)) as {
      activities: unknown[];
      nextOffset: number | null;
    };
    expect(first.activities).toHaveLength(0);
    expect(first.nextOffset).toBe(500);
    database.activities.push(sampleActivity(550, { title: "特别球局" }));
    const second = (await listActivities(
      { limit: 1, keyword: "特别", offset: first.nextOffset },
      context,
    )) as {
      activities: Array<{ id: string }>;
    };
    expect(second.activities.map((activity) => activity.id)).toEqual(["game-550"]);
  });

  it("keeps old calls valid and uses the current capacity", async () => {
    database.activities.push(sampleActivity(1), sampleActivity(2, { registeredCount: 8 }));
    const oldCall = (await listActivities({ limit: 2 }, context)) as { activities: unknown[] };
    expect(oldCall.activities).toHaveLength(2);
    const withSpots = (await listActivities({ limit: 2, hasSpots: true }, context)) as {
      activities: unknown[];
    };
    expect(withSpots.activities).toHaveLength(1);
  });

  it("returns only the authenticated organizer's latest created activity", async () => {
    database.activities.push(
      sampleActivity(1, { organizerId: "user-1" }),
      sampleActivity(2, { organizerId: "user-2" }),
      sampleActivity(3, { organizerId: "user-1" }),
    );
    const result = (await getLatestCreatedActivity({}, context)) as { activity: { id: string } };
    expect(result.activity.id).toBe("game-3");
    expect(database.activityQueries.at(-1)).toEqual({ organizerId: "user-1" });
  });

  it("returns null when the current user has never created an activity", async () => {
    database.activities.push(sampleActivity(1, { organizerId: "user-2" }));
    expect(await getLatestCreatedActivity({}, context)).toEqual({ activity: null });
  });
});
