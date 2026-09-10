import { AppError } from "./errors.js";
import {
  getAdminDashboard,
  listReports,
  resolveReport,
  restrictUser,
  unpublishActivity,
} from "./modules/admin.js";
import {
  acknowledgeActivityChange,
  cancelActivity,
  createActivity,
  getActivity,
  listActivities,
  updateActivity,
} from "./modules/activity.js";
import { getHealth } from "./modules/health.js";
import {
  confirmScore,
  createManualMatch,
  generateGrouping,
  getLiveCourt,
  getPlayerStats,
  lockScore,
  publishRound,
  submitScore,
  unlockScore,
  updateDraftMatch,
} from "./modules/live.js";
import { listNotifications, markNotificationRead } from "./modules/notification.js";
import {
  finishActivity,
  listParticipants,
  setAttendance,
  startActivity,
} from "./modules/participation.js";
import {
  joinRegistration,
  leaveRegistration,
  promoteWaitlistedRegistration,
} from "./modules/registration.js";
import { createReport } from "./modules/report.js";
import { listSchools } from "./modules/school.js";
import { getSession } from "./modules/session.js";
import { getMe, updateMe } from "./modules/user.js";
import { getVenue, listVenues } from "./modules/venue.js";
import type { Route } from "./types.js";

const routes: Readonly<Record<string, Route>> = {
  "health.get": { handler: getHealth, requiresAuth: false },
  "auth.session": { handler: getSession, requiresAuth: true },
  "user.getMe": { handler: getMe, requiresAuth: true },
  "user.updateMe": { handler: updateMe, requiresAuth: true },
  "school.list": { handler: listSchools, requiresAuth: false },
  "venue.list": { handler: listVenues, requiresAuth: false },
  "venue.get": { handler: getVenue, requiresAuth: false },
  "activity.list": { handler: listActivities, requiresAuth: false },
  "activity.get": { handler: getActivity, requiresAuth: false },
  "activity.create": { handler: createActivity, requiresAuth: true },
  "activity.update": { handler: updateActivity, requiresAuth: true },
  "activity.cancel": { handler: cancelActivity, requiresAuth: true },
  "activity.ackChange": { handler: acknowledgeActivityChange, requiresAuth: true },
  "activity.start": { handler: startActivity, requiresAuth: true },
  "activity.finish": { handler: finishActivity, requiresAuth: true },
  "participant.list": { handler: listParticipants, requiresAuth: true },
  "participant.setAttendance": { handler: setAttendance, requiresAuth: true },
  "registration.join": { handler: joinRegistration, requiresAuth: true },
  "registration.leave": { handler: leaveRegistration, requiresAuth: true },
  "registration.promote": { handler: promoteWaitlistedRegistration, requiresAuth: true },
  "live.get": { handler: getLiveCourt, requiresAuth: true },
  "grouping.generate": { handler: generateGrouping, requiresAuth: true },
  "grouping.publish": { handler: publishRound, requiresAuth: true },
  "grouping.update": { handler: updateDraftMatch, requiresAuth: true },
  "match.create": { handler: createManualMatch, requiresAuth: true },
  "score.submit": { handler: submitScore, requiresAuth: true },
  "score.confirm": { handler: confirmScore, requiresAuth: true },
  "score.lock": { handler: lockScore, requiresAuth: true },
  "score.unlock": { handler: unlockScore, requiresAuth: true },
  "score.stats": { handler: getPlayerStats, requiresAuth: true },
  "notification.list": { handler: listNotifications, requiresAuth: true },
  "notification.markRead": { handler: markNotificationRead, requiresAuth: true },
  "report.create": { handler: createReport, requiresAuth: true },
  "admin.dashboard": { handler: getAdminDashboard, requiresAuth: true },
  "admin.report.list": { handler: listReports, requiresAuth: true },
  "admin.report.resolve": { handler: resolveReport, requiresAuth: true },
  "admin.activity.unpublish": { handler: unpublishActivity, requiresAuth: true },
  "admin.user.restrict": { handler: restrictUser, requiresAuth: true },
};

export function resolveRoute(action: unknown): Route {
  if (typeof action !== "string" || !routes[action]) {
    throw new AppError("ACTION_NOT_FOUND", "请求的操作不存在");
  }
  return routes[action];
}
