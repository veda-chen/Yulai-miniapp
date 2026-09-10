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
])
  await stat(path);

const pkg = JSON.parse(await readFile("package.json", "utf8"));
for (const script of ["backup:cloud", "restore:plan", "m5:verify", "release:gate", "release:check"])
  if (!pkg.scripts[script]) throw new Error(`缺少M5命令: ${script}`);
if (!pkg.scripts.check.includes("m5:verify")) throw new Error("pnpm check 必须包含 M5 自动校验");
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
