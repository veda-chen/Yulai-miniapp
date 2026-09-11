import { readFile, stat } from "node:fs/promises";

const requiredFiles = [
  "apps/miniprogram/pages/profile/edit.ts",
  "apps/miniprogram/pages/venues/list.ts",
  "apps/miniprogram/pages/venues/detail.ts",
  "apps/miniprogram/pages/activities/list.ts",
  "apps/miniprogram/pages/activities/detail.ts",
  "apps/miniprogram/pages/activities/form.ts",
  "cloudfunctions/api/src/modules/user.ts",
  "cloudfunctions/api/src/modules/school.ts",
  "cloudfunctions/api/src/modules/venue.ts",
  "cloudfunctions/api/src/modules/activity.ts",
  "cloudfunctions/api/src/modules/registration.ts",
  "cloudfunctions/api/src/modules/registration-domain.ts",
  "cloudbase/seeds/schools.json",
  "cloudbase/m2-commands.json",
  "cloudbase/m2-activity-commands.json",
];

for (const path of requiredFiles) {
  await stat(path);
}

const router = await readFile("cloudfunctions/api/src/router.ts", "utf8");
for (const action of [
  "user.getMe",
  "user.updateMe",
  "user.updateAvatar",
  "school.list",
  "venue.list",
  "venue.get",
  "activity.list",
  "activity.get",
  "activity.create",
  "activity.update",
  "registration.join",
  "registration.leave",
]) {
  if (!router.includes(`"${action}"`)) throw new Error(`缺少M2云函数动作: ${action}`);
}

const appConfig = JSON.parse(await readFile("apps/miniprogram/app.json", "utf8"));
for (const page of [
  "pages/profile/edit",
  "pages/venues/list",
  "pages/venues/detail",
  "pages/activities/list",
  "pages/activities/detail",
  "pages/activities/form",
]) {
  if (!appConfig.pages.includes(page)) throw new Error(`缺少M2页面: ${page}`);
}

const userModule = await readFile("cloudfunctions/api/src/modules/user.ts", "utf8");
if (!userModule.includes("update.schoolId = null")) {
  throw new Error("学校清空规则未实现");
}

const registrationModule = await readFile("cloudfunctions/api/src/modules/registration.ts", "utf8");
for (const requiredRule of [
  "db.runTransaction",
  "REGISTRATION_PROMOTED",
  "registrationDeadline",
  "confirmedUserIds",
  "waitlistUserIds",
]) {
  if (!registrationModule.includes(requiredRule)) {
    throw new Error(`缺少M2报名规则: ${requiredRule}`);
  }
}

const venueSeeds = JSON.parse(await readFile("cloudbase/seeds/venues.json", "utf8"));
if (!Array.isArray(venueSeeds) || venueSeeds.length < 1) {
  throw new Error("场馆种子数据必须是非空数组");
}
const seedCommands = JSON.parse(await readFile("cloudbase/seed-commands.json", "utf8"));
if (!Array.isArray(seedCommands) || seedCommands.length < 1) {
  throw new Error("场馆种子命令必须是非空数组");
}

console.log("M2 complete scope verified");
