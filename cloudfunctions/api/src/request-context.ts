import { randomUUID } from "node:crypto";
import { AppError } from "./errors.js";
import type { CloudEvent, RequestContext, WxContext } from "./types.js";

export function createRequestContext(
  event: CloudEvent,
  wxContext: WxContext,
  requiresAuth = true,
): RequestContext {
  if (requiresAuth && !wxContext.OPENID) {
    throw new AppError("UNAUTHENTICATED", "无法识别当前微信用户");
  }

  const requestId =
    typeof event.requestId === "string" && event.requestId.length >= 8
      ? event.requestId.slice(0, 64)
      : randomUUID();

  return {
    requestId,
    ...(wxContext.OPENID ? { openid: wxContext.OPENID } : {}),
    ...(wxContext.APPID ? { appid: wxContext.APPID } : {}),
    ...(wxContext.ENV ? { envId: wxContext.ENV } : {}),
  };
}
