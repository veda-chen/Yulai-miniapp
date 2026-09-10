import { readFile, stat } from "node:fs/promises";

const requiredFiles = [
  "project.config.json",
  "cloudbaserc.json",
  "apps/miniprogram/app.ts",
  "apps/miniprogram/services/cloud-api.ts",
  "cloudfunctions/api/src/index.ts",
  "cloudfunctions/api/src/request-context.ts",
  "cloudbase/collections.json",
  "cloudbase/seeds/venues.json",
  "cloudbase/seeds/schools.json",
  "cloudbase/SETUP.md",
];

for (const path of requiredFiles) {
  await stat(path);
}

const projectConfig = JSON.parse(await readFile("project.config.json", "utf8"));
if (
  projectConfig.miniprogramRoot !== "apps/miniprogram/" ||
  projectConfig.cloudfunctionRoot !== "cloudfunctions/" ||
  !projectConfig.setting.useCompilerPlugins.includes("typescript")
) {
  throw new Error("微信开发者工具目录配置不符合 M1 基线");
}

const cloudbaseConfig = JSON.parse(await readFile("cloudbaserc.json", "utf8"));
if (
  cloudbaseConfig.envId !== "{{env.CLOUDBASE_ENV_ID}}" ||
  cloudbaseConfig.functions[0]?.handler !== "index.main" ||
  cloudbaseConfig.functions[0]?.runtime !== "Nodejs20.19"
) {
  throw new Error("CloudBase CLI 配置不符合 M1 基线");
}

const collections = JSON.parse(await readFile("cloudbase/collections.json", "utf8"));
const names = new Set(collections.collections.map((collection) => collection.name));
if (collections.collections.some((collection) => collection.clientPermission !== "ADMINONLY")) {
  throw new Error("业务集合必须声明为仅管理端可读写");
}
for (const name of [
  "users",
  "venues",
  "activities",
  "registrations",
  "participants",
  "auditLogs",
]) {
  if (!names.has(name)) throw new Error(`缺少集合定义: ${name}`);
}

const seed = JSON.parse(await readFile("cloudbase/seeds/venues.json", "utf8"));
if (
  seed[0]?.name !== "广东工业大学大学城校区体育馆" ||
  seed[0]?.status !== "PENDING_VERIFICATION"
) {
  throw new Error("试点场馆种子数据不正确");
}

const appSource = await readFile("apps/miniprogram/app.ts", "utf8");
if (!appSource.includes('env: "cloud1-d1g8z3590d3768cbb"')) {
  throw new Error("小程序没有绑定 M1 开发云环境");
}

console.log("M1 baseline verified");
