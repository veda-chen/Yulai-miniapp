import { cloud, db } from "../db.js";
import type { CloudEvent } from "../types.js";

export const RETENTION_DAYS = 180;
export const RETENTION_TRIGGER_NAME = "purge-deleted-users-daily";
const DAY_MS = 24 * 60 * 60 * 1000;

export function isRetentionTimerEvent(event: CloudEvent): boolean {
  return event.Type === "Timer" && event.TriggerName === RETENTION_TRIGGER_NAME;
}

export function retentionCutoff(now: Date): Date {
  return new Date(now.getTime() - RETENTION_DAYS * DAY_MS);
}

export async function processFileCleanupJobs(now = new Date()) {
  const result = (await db
    .collection("fileCleanupJobs")
    .where({ status: "PENDING", nextAttemptAt: db.command.lte(now) })
    .orderBy("nextAttemptAt", "asc")
    .limit(20)
    .get()) as unknown as { data: Array<{ _id: string; fileId: string; attempts?: number }> };
  let cleaned = 0;
  let failed = 0;
  for (const job of result.data) {
    try {
      const deletion = (await cloud.deleteFile({ fileList: [job.fileId] })) as {
        fileList?: Array<{ status?: number }>;
      };
      if (deletion.fileList?.some((item) => typeof item.status === "number" && item.status !== 0))
        throw new Error("云存储文件删除失败");
      await db.collection("fileCleanupJobs").doc(job._id).remove();
      cleaned += 1;
    } catch {
      const attempts = (job.attempts ?? 0) + 1;
      await db
        .collection("fileCleanupJobs")
        .doc(job._id)
        .update({
          data: {
            attempts,
            nextAttemptAt: new Date(now.getTime() + Math.min(2 ** attempts, 24) * DAY_MS),
            updatedAt: db.serverDate(),
          },
        });
      failed += 1;
    }
  }
  return { cleaned, failed };
}

export async function purgeExpiredDeletedUsers(now = new Date()) {
  const cutoff = retentionCutoff(now);
  const result = (await db
    .collection("users")
    .where({ status: "DELETED", deletedAt: db.command.lte(cutoff) })
    .remove()) as unknown as { stats: { removed: number } };
  const purged = result.stats?.removed ?? 0;

  if (purged > 0) {
    await db.collection("auditLogs").add({
      data: {
        actorId: null,
        action: "DELETED_USER_RETENTION_PURGED",
        objectType: "SYSTEM",
        objectId: null,
        metadata: {
          purgedCount: purged,
          retentionDays: RETENTION_DAYS,
          cutoffAt: cutoff,
        },
        createdAt: db.serverDate(),
      },
    });
  }

  return { purged, retentionDays: RETENTION_DAYS };
}
