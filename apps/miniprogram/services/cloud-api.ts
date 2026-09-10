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

export async function callCloud<T>(action: string, payload?: unknown): Promise<T> {
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
