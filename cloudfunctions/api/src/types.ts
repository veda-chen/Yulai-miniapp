export type CloudEvent = {
  action?: unknown;
  requestId?: unknown;
  payload?: unknown;
};

export type WxContext = {
  OPENID?: string;
  UNIONID?: string;
  APPID?: string;
  ENV?: string;
};

export type RequestContext = {
  requestId: string;
  openid?: string;
  appid?: string;
  envId?: string;
};

export type Handler = (payload: unknown, context: RequestContext) => Promise<unknown>;

export type Route = {
  handler: Handler;
  requiresAuth: boolean;
};
