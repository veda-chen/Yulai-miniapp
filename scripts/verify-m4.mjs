import { readFile, stat } from "node:fs/promises";

for (const path of [
  "cloudfunctions/api/src/modules/live.ts",
  "cloudfunctions/api/src/modules/live-domain.ts",
  "apps/miniprogram/pages/activities/live.ts",
  "apps/miniprogram/pages/activities/live.wxml",
  "cloudbase/m4-commands.json",
  "cloudbase/m4-index-patch.json",
])
  await stat(path);

const router = await readFile("cloudfunctions/api/src/router.ts", "utf8");
for (const action of [
  "live.get",
  "grouping.generate",
  "grouping.update",
  "grouping.publish",
  "match.create",
  "score.submit",
  "score.confirm",
  "score.lock",
  "score.unlock",
  "score.stats",
])
  if (!router.includes(`"${action}"`)) throw new Error(`缺少M4云函数动作: ${action}`);

const collections = JSON.parse(await readFile("cloudbase/collections.json", "utf8"));
for (const name of ["rounds", "matches", "matchPlayers", "scoreRevisions"]) {
  const collection = collections.collections.find((item) => item.name === name);
  if (!collection) throw new Error(`缺少M4集合: ${name}`);
  if (collection.clientPermission !== "ADMINONLY") throw new Error(`${name}必须限制客户端直读写`);
}
const participants = collections.collections.find((item) => item.name === "participants");
if (!participants?.indexes.some((item) => item.name === "activityId_status_attendanceStatus")) {
  throw new Error("缺少到场分组复合索引");
}

const app = JSON.parse(await readFile("apps/miniprogram/app.json", "utf8"));
if (!app.pages.includes("pages/activities/live")) throw new Error("缺少M4现场页面");
console.log("M4 complete scope verified");
