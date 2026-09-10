import cloud from "wx-server-sdk";

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV as unknown as string });

export const db = cloud.database();
export { cloud };
