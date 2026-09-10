import type { Handler } from "../types.js";

export const getHealth: Handler = async (_payload, context) => ({
  status: "ok",
  service: "yulai-cloud-api",
  timestamp: new Date().toISOString(),
  environment: context.envId ?? "unknown",
});
