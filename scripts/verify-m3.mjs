import { readFile, stat } from "node:fs/promises";

const requiredFiles = [
  "cloudfunctions/api/src/modules/notification.ts",
  "cloudfunctions/api/src/modules/participation.ts",
  "cloudfunctions/api/src/modules/report.ts",
  "cloudfunctions/api/src/modules/admin.ts",
  "apps/miniprogram/pages/notifications/list.ts",
  "apps/miniprogram/config/subscription.ts",
  "apps/miniprogram/pages/activities/participants.ts",
  "apps/miniprogram/pages/reports/form.ts",
  "apps/miniprogram/pages/admin/index.ts",
  "cloudbase/m3-commands.json",
];
for (const path of requiredFiles) await stat(path);

const router = await readFile("cloudfunctions/api/src/router.ts", "utf8");
for (const action of [
  "activity.cancel",
  "activity.ackChange",
  "activity.start",
  "activity.finish",
  "registration.promote",
  "participant.list",
  "participant.setAttendance",
  "notification.list",
  "notification.markRead",
  "notification.subscription.list",
  "notification.subscription.save",
  "report.create",
  "admin.dashboard",
  "admin.venue.list",
  "admin.venue.update",
  "admin.report.resolve",
  "admin.activity.unpublish",
  "admin.user.restrict",
]) {
  if (!router.includes(`"${action}"`)) throw new Error(`缺少M3云函数动作: ${action}`);
}

const collections = JSON.parse(await readFile("cloudbase/collections.json", "utf8"));
for (const name of ["activityChanges", "notificationJobs", "subscriptionPreferences", "reports"]) {
  const collection = collections.collections.find((item) => item.name === name);
  if (!collection) throw new Error(`缺少M3集合: ${name}`);
  if (collection.clientPermission !== "ADMINONLY") throw new Error(`${name}必须限制客户端直读写`);
}

const app = JSON.parse(await readFile("apps/miniprogram/app.json", "utf8"));
for (const page of [
  "pages/notifications/list",
  "pages/activities/participants",
  "pages/reports/form",
  "pages/admin/index",
]) {
  if (!app.pages.includes(page)) throw new Error(`缺少M3页面: ${page}`);
}

console.log("M3 complete scope verified");
