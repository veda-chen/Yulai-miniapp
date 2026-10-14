import { describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const remove = vi.fn(async () => ({ stats: { removed: 2 } }));
  const add = vi.fn(async () => ({ id: "audit-1" }));
  const lte = vi.fn((value: Date) => ({ lte: value }));
  const deleteFile = vi.fn(
    async (): Promise<{ fileList: Array<{ status: number }> }> => ({ fileList: [] }),
  );
  const fileRemove = vi.fn(async () => ({ stats: { removed: 1 } }));
  const fileUpdate = vi.fn(async () => ({ stats: { updated: 1 } }));
  const fileGet = vi.fn(async () => ({
    data: [{ _id: "cleanup-1", fileId: "cloud://test/avatar.jpg", attempts: 0 }],
  }));
  return {
    add,
    lte,
    remove,
    deleteFile,
    fileRemove,
    fileUpdate,
    fileGet,
    db: {
      command: { lte },
      serverDate: () => "SERVER_DATE",
      collection: (name: string) => {
        if (name === "users") return { where: () => ({ remove }) };
        if (name === "auditLogs") return { add };
        if (name === "fileCleanupJobs")
          return {
            where: () => ({ orderBy: () => ({ limit: () => ({ get: fileGet }) }) }),
            doc: () => ({ remove: fileRemove, update: fileUpdate }),
          };
        throw new Error(`Unexpected collection: ${name}`);
      },
    },
  };
});

vi.mock("../db.js", () => ({ db: database.db, cloud: { deleteFile: database.deleteFile } }));

import {
  isRetentionTimerEvent,
  processFileCleanupJobs,
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

  it("retries queued avatar deletion and clears the job after success", async () => {
    const result = await processFileCleanupJobs(new Date("2026-09-10T00:00:00.000Z"));
    expect(database.deleteFile).toHaveBeenCalledWith({
      fileList: ["cloud://test/avatar.jpg"],
    });
    expect(database.fileRemove).toHaveBeenCalledOnce();
    expect(result).toEqual({ cleaned: 1, failed: 0 });
  });

  it("keeps a failed file deletion for a later retry", async () => {
    database.deleteFile.mockResolvedValueOnce({ fileList: [{ status: -1 }] });
    const result = await processFileCleanupJobs(new Date("2026-09-10T00:00:00.000Z"));
    expect(result).toEqual({ cleaned: 0, failed: 1 });
    expect(database.fileUpdate).toHaveBeenCalledWith({
      data: expect.objectContaining({ attempts: 1, nextAttemptAt: expect.any(Date) }),
    });
  });
});
