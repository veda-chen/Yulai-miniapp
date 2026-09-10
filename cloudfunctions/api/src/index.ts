import { cloud } from "./db.js";
import { AppError, errorMessage } from "./errors.js";
import { createRequestContext } from "./request-context.js";
import { resolveRoute } from "./router.js";
import type { CloudEvent, WxContext } from "./types.js";

export function createMain(getWxContext: () => WxContext) {
  return async function handleCloudEvent(event: CloudEvent = {}) {
    let requestId = typeof event.requestId === "string" ? event.requestId.slice(0, 64) : "unknown";

    try {
      const route = resolveRoute(event.action);
      const context = createRequestContext(event, getWxContext(), route.requiresAuth);
      requestId = context.requestId;
      const data = await route.handler(event.payload, context);
      return { ok: true, requestId, data };
    } catch (error) {
      const appError = error instanceof AppError ? error : undefined;
      console.error(
        JSON.stringify({
          requestId,
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
