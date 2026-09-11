import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { AppError } from "./errors.js";

export function hashOpenId(openid: string, secret = process.env.OPENID_HASH_SECRET): string {
  if (!secret || secret.length < 32) {
    throw new AppError("SERVER_MISCONFIGURED", "OPENID_HASH_SECRET 未正确配置");
  }
  return createHmac("sha256", secret).update(openid).digest("hex");
}

function subscriptionKey(secret = process.env.SUBSCRIPTION_OPENID_KEY): Buffer {
  if (!secret || secret.length < 32) {
    throw new AppError("SERVER_MISCONFIGURED", "SUBSCRIPTION_OPENID_KEY 未正确配置");
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptSubscriptionOpenId(openid: string, secret?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", subscriptionKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(openid, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptSubscriptionOpenId(value: string, secret?: string): string {
  const [version, ivValue, tagValue, encryptedValue] = value.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) {
    throw new AppError("INVALID_ENCRYPTED_VALUE", "订阅接收标识格式无效");
  }
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      subscriptionKey(secret),
      Buffer.from(ivValue, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new AppError("INVALID_ENCRYPTED_VALUE", "订阅接收标识无法解密");
  }
}
