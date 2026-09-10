import { describe, expect, it, vi } from "vitest";
import { createMain } from "./index.js";

describe("cloud api entry", () => {
  it("runs the health route through the real entry pipeline", async () => {
    const main = createMain(() => ({ ENV: "test-env" }));
    const result = await main({ action: "health.get", requestId: "request-123" });

    expect(result).toMatchObject({
      ok: true,
      requestId: "request-123",
      data: { status: "ok", service: "yulai-cloud-api", environment: "test-env" },
    });
  });

  it("returns a stable error for unknown actions", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const main = createMain(() => ({ OPENID: "openid-1" }));
    const result = await main({ action: "missing.action", requestId: "request-456" });

    expect(result).toEqual({
      ok: false,
      requestId: "request-456",
      error: { code: "ACTION_NOT_FOUND", message: "请求的操作不存在" },
    });
  });
});
