import assert from "node:assert/strict";
import {
  activityStatusView,
  validateActivityForm,
} from "../apps/miniprogram/utils/activity-experience.ts";
import {
  activitySearchListUrl,
  normalizeActivitySearchKeyword,
  RequestVersion,
} from "../apps/miniprogram/utils/activity-search.ts";

const future = "2099-01-01T10:00:00.000Z";
assert.equal(
  activityStatusView(
    { status: "OPEN", registrationDeadline: future, capacity: 8, registeredCount: 5 },
    null,
    0,
  ).capacityHint,
  "剩余 3 个名额",
);
assert.equal(
  activityStatusView(
    { status: "OPEN", registrationDeadline: future, capacity: 8, registeredCount: 8 },
    null,
    0,
  ).capacityHint,
  "已满员，可加入候补",
);
assert.equal(
  activityStatusView(
    {
      status: "OPEN",
      registrationDeadline: "2020-01-01T00:00:00.000Z",
      capacity: 8,
      registeredCount: 4,
    },
    "CONFIRMED",
    Date.now(),
  ).registrationActionAvailable,
  true,
);

const validForm = {
  venueId: "venue-1",
  venueUnavailable: false,
  startDate: "2099-01-02",
  startTime: "19:00",
  endDate: "2099-01-02",
  endTime: "21:00",
  deadlineDate: "2099-01-02",
  deadlineTime: "17:00",
  capacity: "12",
};
assert.ok(validateActivityForm(validForm, 0).values);
assert.equal(
  validateActivityForm({ ...validForm, capacity: "3" }, 0).errors.capacity,
  "人数上限需为4至40人",
);
assert.equal(
  validateActivityForm({ ...validForm, deadlineTime: "20:00" }, 0).errors.deadline,
  "报名截止时间不能晚于开始时间",
);

assert.equal(normalizeActivitySearchKeyword(`  ${"羽".repeat(55)}  `).length, 50);
assert.equal(
  activitySearchListUrl("广工 & 进阶/双打"),
  "/pages/activities/list?keyword=%E5%B9%BF%E5%B7%A5%20%26%20%E8%BF%9B%E9%98%B6%2F%E5%8F%8C%E6%89%93",
);

const versions = new RequestVersion();
const first = versions.begin();
const second = versions.begin();
assert.equal(versions.isCurrent(first), false);
assert.equal(versions.isCurrent(second), true);
versions.invalidate();
assert.equal(versions.isCurrent(second), false);

const controlled = new RequestVersion();
const applied = [];
const slowVersion = controlled.begin();
const slow = Promise.resolve().then(() => {
  if (controlled.isCurrent(slowVersion)) applied.push("旧结果");
});
const fastVersion = controlled.begin();
if (controlled.isCurrent(fastVersion)) applied.push("新结果");
await slow;
assert.deepEqual(applied, ["新结果"]);

console.log("Core experience behavior verified");
await import("./verify-page-experience.mjs");
