import { db } from "../db.js";
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
