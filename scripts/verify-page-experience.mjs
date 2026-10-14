import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as search from "../apps/miniprogram/utils/activity-search.ts";
import * as dates from "../apps/miniprogram/utils/date.ts";
import * as activityExperience from "../apps/miniprogram/utils/activity-experience.ts";

function page(path, overrides = {}) {
  let definition;
  const timers = new Map();
  let timerId = 0;
  const dependencies = {
    appearanceView: () => ({}),
    getDefaultActivityTimes: () => ({ startDate: "2099-01-01" }),
    ...search,
    ...dates,
    ...activityExperience,
    ...overrides,
  };
  const source = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, {
    exports: {},
    require: () => dependencies,
    Page: (value) => {
      definition = value;
    },
    wx: overrides.wx ?? {},
    setTimeout: (callback) => {
      timers.set(++timerId, callback);
      return timerId;
    },
    clearTimeout: (id) => timers.delete(id),
  });
  definition.setData = function (update, callback) {
    Object.assign(this.data, update);
    callback?.();
  };
  return { instance: definition, timers };
}

const requests = [];
const { instance: home, timers } = page("apps/miniprogram/pages/index/index.ts", {
  callCloud: (_action, payload) => new Promise((resolve) => requests.push({ payload, resolve })),
});
home.data.displayedSearchKeyword = "广工";
home.data.searchKeyword = "广工";
home.data.recommendedActivities = [{ id: "old" }];
home.onSearchInput({ detail: { value: "进阶" } });
assert.equal(timers.size, 1);
assert.equal(home.data.recommendedActivities.length, 0);
home.confirmSearch();
assert.equal(timers.size, 0);
assert.equal(requests.length, 1);
home.clearSearch();
assert.equal(requests.length, 2);
assert.equal(requests[1].payload.keyword, "");
requests[1].resolve({ activities: [], nextOffset: null });
await new Promise(setImmediate);
requests[0].resolve({ activities: [], nextOffset: 20 });
await new Promise(setImmediate);
assert.equal(home.data.displayedSearchKeyword, "");
assert.equal(home.data.recommendationsNextOffset, null);
home.data.recommendedActivities = [{ id: "retained" }];
const refresh = home.loadRecommendations();
assert.equal(home.data.recommendedActivities[0].id, "retained");
home.onHide();
requests[2].resolve({ activities: [], nextOffset: null });
await refresh;
assert.equal(home.data.recommendedActivities[0].id, "retained");

const { instance: detail } = page("apps/miniprogram/pages/activities/detail.ts");
detail.activityId = "game";
detail.data.activity = { id: "game" };
detail.loadActivity = async (options) => {
  assert.equal(options.preserve, true);
};
await detail.retryLoad();

let writes = 0;
let target = "";
const { instance: form } = page("apps/miniprogram/pages/activities/form.ts", {
  wx: {
    setStorageSync: () => {
      writes += 1;
    },
    redirectTo: ({ url, fail }) => {
      target = url;
      fail();
    },
  },
});
form.data.loading = false;
form.data.publishedActivityId = "saved";
form.saveDraft();
assert.equal(writes, 0);
form.data.activityId = "saved";
form.viewPublishedActivity();
assert.equal(target, "/pages/activities/detail?id=saved");
assert.match(form.data.message, /已保存/);

const listRequests = [];
const { instance: list, timers: listTimers } = page("apps/miniprogram/pages/activities/list.ts", {
  callCloud: (_action, payload) =>
    new Promise((resolve) => listRequests.push({ payload, resolve })),
});
list.data.venues = [
  { id: "", name: "不限场馆" },
  { id: "real-venue-id", name: "试点场馆" },
];
list.data.venueIndex = 1;
list.data.levelIndex = 3;
list.data.hasSpots = true;
list.data.keyword = "进阶";
const oldList = list.load(true);
assert.equal(listRequests[0].payload.venueId, "real-venue-id");
assert.equal(listRequests[0].payload.level, "IMPROVING");
assert.equal(listRequests[0].payload.hasSpots, true);
list.onDayTap({ currentTarget: { dataset: { key: "today" } } });
assert.ok(listRequests[1].payload.startAtFrom);
listRequests[1].resolve({ activities: [], nextOffset: null });
await new Promise(setImmediate);
listRequests[0].resolve({ activities: [], nextOffset: 20 });
await oldList;
assert.equal(list.data.nextOffset, null);
list.resetFilters();
assert.equal(listRequests[2].payload.venueId, undefined);
assert.equal(listRequests[2].payload.level, undefined);
listRequests[2].resolve({ activities: [], nextOffset: null });
await new Promise(setImmediate);
list.data.activities = [{ id: "old-result" }];
list.data.displayedKeyword = "";
list.onSearchInput({ detail: { value: "新球局" } });
assert.equal(list.data.activities.length, 0);
assert.equal(listTimers.size, 1);
list.confirmSearch();
assert.equal(listTimers.size, 0);
listRequests[3].resolve({ activities: [], nextOffset: null });
await new Promise(setImmediate);

let copiedDraft;
let createCalls = 0;
let allowReplace = true;
const { instance: copyForm } = page("apps/miniprogram/pages/activities/form.ts", {
  callCloud: async (action) => {
    if (action === "activity.latestCreated")
      return {
        activity: {
          title: "上次球局",
          venue: { id: "old-venue", name: "旧场馆" },
          capacity: 8,
          level: "IMPROVING",
          locationHint: "7号场",
          feeNote: "线下均摊",
          contact: null,
          contactVisibility: "NONE",
          details: "带球",
          visibility: "PUBLIC",
          groupingEnabled: false,
          scoringEnabled: false,
        },
      };
    if (action === "activity.create") {
      createCalls += 1;
      return { activity: { id: "new-game" } };
    }
    throw Error(`Unexpected action: ${action}`);
  },
  wx: {
    getStorageSync: () => null,
    removeStorageSync: () => {},
    setStorageSync: (_key, value) => {
      copiedDraft = value;
    },
    showModal: async () => ({ confirm: allowReplace }),
    redirectTo: () => {},
    pageScrollTo: () => {},
  },
});
copyForm.data.loading = false;
copyForm.data.title = "尚未发布的草稿";
copyForm.data.venues = [{ id: "active-venue", name: "新场馆" }];
await copyForm.copyLatestActivity();
assert.equal(copyForm.data.title, "上次球局");
assert.equal(copyForm.data.locationHint, "");
assert.equal(copyForm.data.venueUnavailable, true);
assert.notEqual(copyForm.data.idempotencyKey, "");
assert.equal(copiedDraft.data.title, "上次球局");
allowReplace = false;
copyForm.data.title = "继续填写的草稿";
await copyForm.copyLatestActivity();
assert.equal(copyForm.data.title, "继续填写的草稿");
allowReplace = true;
copyForm.data.title = "上次球局";
copyForm.onVenueChange({ detail: { value: "0" } });
const publishing = copyForm.onSave();
await copyForm.onSave();
await publishing;
assert.equal(createCalls, 1);
console.log(
  "Page experience verified: stale search, combined filters, draft copy and duplicate publish protection",
);
