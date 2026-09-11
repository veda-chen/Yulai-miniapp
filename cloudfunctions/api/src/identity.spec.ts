import { describe, expect, it } from "vitest";
import { decryptSubscriptionOpenId, encryptSubscriptionOpenId } from "./identity.js";

const SECRET = "test-subscription-secret-with-at-least-32-characters";

describe("subscription OpenID encryption", () => {
  it("round trips an OpenID without storing plaintext", () => {
    const encrypted = encryptSubscriptionOpenId("openid-for-user-1", SECRET);
    expect(encrypted).not.toContain("openid-for-user-1");
    expect(decryptSubscriptionOpenId(encrypted, SECRET)).toBe("openid-for-user-1");
  });

  it("rejects decryption with a different key", () => {
    const encrypted = encryptSubscriptionOpenId("openid-for-user-1", SECRET);
    expect(() =>
      decryptSubscriptionOpenId(encrypted, "different-secret-with-at-least-32-characters"),
    ).toThrow("订阅接收标识无法解密");
  });
});
