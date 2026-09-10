import { createHmac } from "node:crypto";
import { AppError } from "./errors.js";

export function hashOpenId(openid: string, secret = process.env.OPENID_HASH_SECRET): string {
  if (!secret || secret.length < 32) {
    throw new AppError("SERVER_MISCONFIGURED", "OPENID_HASH_SECRET 未正确配置");
  }
  return createHmac("sha256", secret).update(openid).digest("hex");
}
