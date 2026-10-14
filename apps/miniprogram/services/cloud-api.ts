type CloudSuccess<T> = {
  ok: true;
  requestId: string;
  data: T;
};

type CloudFailure = {
  ok: false;
  requestId: string;
  error: {
    code: string;
    message: string;
  };
};

type CloudResponse<T> = CloudSuccess<T> | CloudFailure;

export class CloudApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly requestId: string,
  ) {
    super(message);
  }
}

function createRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const readCache = new Map<string, { expiresAt: number; data: unknown }>();
const inFlightReads = new Map<string, Promise<unknown>>();
const cacheGeneration = new Map<string, number>();

function cacheDuration(action: string, payload: unknown): number {
  if (payload !== undefined) return 0;
  if (action === "auth.session") return 30_000;
  if (action === "venue.list") return 60_000;
  return 0;
}

export function invalidateCloudReadCache(action?: "auth.session" | "venue.list") {
  for (const key of action ? [action] : ["auth.session", "venue.list"]) {
    readCache.delete(key);
    inFlightReads.delete(key);
    cacheGeneration.set(key, (cacheGeneration.get(key) ?? 0) + 1);
  }
}

async function invokeCloud<T>(action: string, payload?: unknown): Promise<T> {
  const requestId = createRequestId();
  const result = await wx.cloud.callFunction({
    name: "api",
    data: { action, requestId, ...(payload === undefined ? {} : { payload }) },
  });
  const response = result.result as CloudResponse<T> | undefined;

  if (!response || typeof response.ok !== "boolean" || typeof response.requestId !== "string") {
    throw new CloudApiError("INVALID_RESPONSE", "云函数返回了无法识别的数据", requestId);
  }
  if (!response.ok) {
    throw new CloudApiError(response.error.code, response.error.message, response.requestId);
  }
  return response.data;
}

export async function callCloud<T>(action: string, payload?: unknown): Promise<T> {
  const duration = cacheDuration(action, payload);
  if (duration > 0) {
    const cached = readCache.get(action);
    if (cached && cached.expiresAt > Date.now()) return cached.data as T;
    const current = inFlightReads.get(action);
    if (current) return current as Promise<T>;
    const generation = cacheGeneration.get(action) ?? 0;
    const pending = invokeCloud<T>(action, payload);
    inFlightReads.set(action, pending);
    try {
      const data = await pending;
      if ((cacheGeneration.get(action) ?? 0) === generation)
        readCache.set(action, { expiresAt: Date.now() + duration, data });
      return data;
    } finally {
      if (inFlightReads.get(action) === pending) inFlightReads.delete(action);
    }
  }
  const data = await invokeCloud<T>(action, payload);
  if (action === "admin.venue.update") invalidateCloudReadCache("venue.list");
  if (action === "user.deleteMe") invalidateCloudReadCache();
  return data;
}
