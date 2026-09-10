import { describe, expect, it } from "vitest";
import { createRequestContext } from "./request-context.js";

describe("createRequestContext", () => {
  it("uses the trusted cloud context identity", () => {
    const context = createRequestContext(
      { action: "health.get", requestId: "request-123" },
      { OPENID: "openid-1", ENV: "dev" },
    );
    expect(context).toMatchObject({ requestId: "request-123", openid: "openid-1", envId: "dev" });
  });

  it("rejects calls without an OPENID", () => {
    expect(() => createRequestContext({}, {})).toThrow("无法识别当前微信用户");
  });

  it("allows an operational health context without an OPENID", () => {
    expect(createRequestContext({ requestId: "request-789" }, {}, false)).toEqual({
      requestId: "request-789",
    });
  });
});
