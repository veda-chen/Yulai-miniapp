import { readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";

for (const path of [
  "docs/M5试点候选版.md",
  "docs/CloudBase备份与恢复手册.md",
  "docs/试点场馆核验表.md",
  "docs/隐私与微信审核清单.md",
  "release/m5-gates.json",
  "scripts/backup-cloudbase.mjs",
  "scripts/prepare-restore-plan.mjs",
  "scripts/check-release-gates.mjs",
  "cloudbase/m5-retention-index.json",
  "scripts/check-cloud-performance.mjs",
  "release/m5-performance.json",
])
  await stat(path);

const router = await readFile("cloudfunctions/api/src/router.ts", "utf8");
if (!router.includes('"user.deleteMe"')) throw new Error("缺少账号注销动作");
const profilePage = await readFile("apps/miniprogram/pages/profile/index.wxml", "utf8");
if (!profilePage.includes('bindtap="deleteAccount"')) throw new Error("缺少账号注销入口");
if (!profilePage.includes("/pages/privacy/index")) throw new Error("缺少隐私与数据入口");
const privacyPage = await readFile("apps/miniprogram/pages/privacy/index.wxml", "utf8");
for (const requiredText of [
  "陈政昊",
  "2724309224@qq.com",
  "学校和自评水平均可不填",
  "已注销球友",
  "最长保存180天",
])
  if (!privacyPage.includes(requiredText))
    throw new Error(`隐私与数据页面缺少内容: ${requiredText}`);
const functionConfig = JSON.parse(await readFile("cloudfunctions/api/config.json", "utf8"));
if (!functionConfig.triggers?.some((trigger) => trigger.name === "purge-deleted-users-daily"))
  throw new Error("缺少注销账号留存清理定时任务");

const pkg = JSON.parse(await readFile("package.json", "utf8"));
for (const script of [
  "backup:cloud",
  "restore:plan",
  "performance:cloud",
  "m5:verify",
  "release:gate",
  "release:check",
])
  if (!pkg.scripts[script]) throw new Error(`缺少M5命令: ${script}`);
if (!pkg.scripts.check.includes("m5:verify")) throw new Error("pnpm check 必须包含 M5 自动校验");
const performanceReport = JSON.parse(await readFile("release/m5-performance.json", "utf8"));
if (!performanceReport.passed || performanceReport.actions?.["activity.list"]?.p95Ms >= 500)
  throw new Error("开发环境只读性能未达到 M5 目标");
if (!(await readFile(".gitignore", "utf8")).split(/\r?\n/).includes(".backups/"))
  throw new Error("备份目录必须被 Git 忽略");

const definition = JSON.parse(await readFile("cloudbase/collections.json", "utf8"));
if (definition.collections.some((item) => item.clientPermission !== "ADMINONLY"))
  throw new Error("所有业务集合必须禁止客户端直接读写");
const config = JSON.parse(await readFile("cloudbaserc.json", "utf8"));
const api = config.functions.find((item) => item.name === "api");
if (!api || api.timeout > 10 || !api.envVariables?.OPENID_HASH_SECRET)
  throw new Error("api 云函数配置不符合 M5 基线");

const venues = JSON.parse(await readFile("cloudbase/seeds/venues.json", "utf8"));
if (!venues.some((venue) => venue.seedKey === "gdut-university-town-gymnasium"))
  throw new Error("缺少试点场馆数据");
const gates = JSON.parse(await readFile("release/m5-gates.json", "utf8")).gates;
const required = new Set([
  "wechat-platform",
  "privacy",
  "venue-data",
  "device-smoke",
  "performance",
  "backup-restore",
]);
for (const gate of gates) required.delete(gate.id);
if (required.size) throw new Error(`缺少发布门槛: ${[...required].join("、")}`);

const dryRun = spawnSync(process.execPath, ["scripts/backup-cloudbase.mjs", "--dry-run"], {
  encoding: "utf8",
  env: { ...process.env, CLOUDBASE_ENV_ID: "m5-verification-environment" },
});
if (dryRun.status !== 0 || !dryRun.stdout.includes("CloudBase backup plan"))
  throw new Error("CloudBase 备份计划无法生成");
console.log("M5 automated candidate scope verified");
