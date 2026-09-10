import { describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const remove = vi.fn(async () => ({ stats: { removed: 2 } }));
  const add = vi.fn(async () => ({ id: "audit-1" }));
  const lte = vi.fn((value: Date) => ({ lte: value }));
  return {
    add,
    lte,
    remove,
    db: {
      command: { lte },
      serverDate: () => "SERVER_DATE",
      collection: (name: string) => {
        if (name === "users") return { where: () => ({ remove }) };
        if (name === "auditLogs") return { add };
        throw new Error(`Unexpected collection: ${name}`);
      },
    },
  };
});

vi.mock("../db.js", () => ({ db: database.db }));

import {
  isRetentionTimerEvent,
  purgeExpiredDeletedUsers,
  retentionCutoff,
  RETENTION_DAYS,
  RETENTION_TRIGGER_NAME,
} from "./retention.js";

describe("deleted account retention", () => {
  it("recognizes only the configured timer event", () => {
    expect(isRetentionTimerEvent({ Type: "Timer", TriggerName: RETENTION_TRIGGER_NAME })).toBe(
      true,
    );
    expect(isRetentionTimerEvent({ Type: "Timer", TriggerName: "other" })).toBe(false);
    expect(isRetentionTimerEvent({ action: "health.get" })).toBe(false);
  });

  it("uses a 180-day cutoff", () => {
    expect(RETENTION_DAYS).toBe(180);
    expect(retentionCutoff(new Date("2026-09-10T00:00:00.000Z")).toISOString()).toBe(
      "2026-03-14T00:00:00.000Z",
    );
  });

  it("removes expired deleted user mappings and writes a count-only audit", async () => {
    const result = await purgeExpiredDeletedUsers(new Date("2026-09-10T00:00:00.000Z"));

    expect(database.remove).toHaveBeenCalledOnce();
    expect(database.lte).toHaveBeenCalledWith(new Date("2026-03-14T00:00:00.000Z"));
    expect(database.add).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: null,
        action: "DELETED_USER_RETENTION_PURGED",
        objectId: null,
        metadata: expect.objectContaining({ purgedCount: 2, retentionDays: 180 }),
      }),
    });
    expect(result).toEqual({ purged: 2, retentionDays: 180 });
  });
});
