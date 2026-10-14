import { cloud } from "./db.js";
import { AppError, errorMessage } from "./errors.js";
import { createRequestContext } from "./request-context.js";
import {
  isSubscriptionDeliveryTimerEvent,
  processPendingSubscriptionMessages,
} from "./modules/notification.js";
import {
  isRetentionTimerEvent,
  processFileCleanupJobs,
  purgeExpiredDeletedUsers,
} from "./modules/retention.js";
import { resolveRoute } from "./router.js";
import { findCurrentUser } from "./modules/user.js";
import type { CloudEvent, WxContext } from "./types.js";

const BUSINESS_WRITES = new Set([
  "user.updateMe",
  "user.updateAvatar",
  "appearance.save",
  "activity.create",
  "invitation.create",
  "invitation.reply",
  "activity.update",
  "activity.cancel",
  "activity.ackChange",
  "activity.start",
  "activity.finish",
  "participant.setAttendance",
  "registration.join",
  "registration.promote",
  "grouping.generate",
  "grouping.publish",
  "grouping.update",
  "match.create",
  "score.submit",
  "score.confirm",
  "score.lock",
  "score.unlock",
  "report.create",
  "notification.subscription.save",
  "admin.venue.update",
  "admin.report.resolve",
  "admin.activity.unpublish",
  "admin.user.restrict",
]);

export function createMain(getWxContext: () => WxContext) {
  return async function handleCloudEvent(event: CloudEvent = {}) {
    const startedAt = Date.now();
    let action = typeof event.action === "string" ? event.action : "unknown";
    let requestId = typeof event.requestId === "string" ? event.requestId.slice(0, 64) : "unknown";

    try {
      if (isRetentionTimerEvent(event)) {
        if (getWxContext().OPENID) throw new AppError("FORBIDDEN", "客户端不能触发维护任务");
        action = "retention.timer";
        requestId = "retention-timer";
        const [retention, fileCleanup] = await Promise.all([
          purgeExpiredDeletedUsers(),
          processFileCleanupJobs(),
        ]);
        const data = { ...retention, fileCleanup };
        console.info(
          JSON.stringify({ action, requestId, result: "ok", durationMs: Date.now() - startedAt }),
        );
        return { ok: true, requestId, data };
      }

      if (isSubscriptionDeliveryTimerEvent(event)) {
        if (getWxContext().OPENID) throw new AppError("FORBIDDEN", "客户端不能触发维护任务");
        action = "subscription.timer";
        requestId = "subscription-delivery-timer";
        const data = await processPendingSubscriptionMessages();
        console.info(
          JSON.stringify({ action, requestId, result: "ok", durationMs: Date.now() - startedAt }),
        );
        return { ok: true, requestId, data };
      }

      const route = resolveRoute(event.action);
      const context = createRequestContext(event, getWxContext(), route.requiresAuth);
      requestId = context.requestId;
      if (BUSINESS_WRITES.has(action)) {
        const user = await findCurrentUser(context);
        if (user.status !== "ACTIVE")
          throw new AppError("ACCOUNT_RESTRICTED", "当前账号暂不能执行此操作");
      }
      const data = await route.handler(event.payload, context);
      console.info(
        JSON.stringify({ action, requestId, result: "ok", durationMs: Date.now() - startedAt }),
      );
      return { ok: true, requestId, data };
    } catch (error) {
      const appError = error instanceof AppError ? error : undefined;
      console.error(
        JSON.stringify({
          requestId,
          action,
          durationMs: Date.now() - startedAt,
          code: appError?.code ?? "INTERNAL_ERROR",
          message: errorMessage(error),
        }),
      );
      return {
        ok: false,
        requestId,
        error: {
          code: appError?.code ?? "INTERNAL_ERROR",
          message: appError?.message ?? "服务暂时不可用",
        },
      };
    }
  };
}

export const main = createMain(() => cloud.getWXContext());
