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
    for (const [path, value] of Object.entries(update)) {
      if (!path.includes(".") && !path.includes("[")) {
        this.data[path] = value;
        continue;
      }
      const keys = path.replace(/\[(\d+)\]/g, ".$1").split(".");
      let target = this.data;
      for (let index = 0; index < keys.length - 1; index += 1) {
        const key = keys[index];
        target[key] ??= /^\d+$/.test(keys[index + 1]) ? [] : {};
        target = target[key];
      }
      target[keys.at(-1)] = value;
    }
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

const liveRequests = [];
const liveToasts = [];
const { instance: live } = page("apps/miniprogram/pages/activities/live.ts", {
  callCloud: (action, payload) =>
    new Promise((resolve, reject) => liveRequests.push({ action, payload, resolve, reject })),
  wx: {
    showToast: (options) => liveToasts.push(options.title),
    setNavigationBarTitle: () => {},
    stopPullDownRefresh: () => {},
  },
});
live.activityId = "activity-1";
live.isVisible = true;
live.data.activity = {
  id: "activity-1",
  title: "旧现场",
  status: "IN_PROGRESS",
  groupingEnabled: true,
  scoringEnabled: true,
  canManage: true,
};
live.data.matches = [
  {
    id: "match-1",
    roundId: "round-1",
    courtLabel: "一号场",
    teamA: [],
    teamB: [],
    matchType: "DOUBLES",
    status: "SCHEDULED",
    scoreA: null,
    scoreB: null,
    confirmations: [],
    version: 1,
    teamAText: "旧 A",
    teamBText: "旧 B",
    statusText: "待开打",
    inputScoreA: "21",
    inputScoreB: "18",
    isPlayer: false,
    confirmationText: "",
  },
];
const liveResult = (title) => ({
  activity: { ...live.data.activity, title },
  participants: [],
  rounds: [],
  matches: [],
  currentUserId: "organizer",
});
const statsResult = { stats: { games: 0, wins: 0, losses: 0, winRate: null } };

assert.notEqual(live.data.activity, null);
const liveRefresh = live.load();
assert.equal(live.data.loading, false);
assert.equal(live.data.refreshing, true);
assert.equal(live.data.matches[0].id, "match-1");
liveRequests[0].resolve(liveResult("新现场"));
liveRequests[1].resolve(statsResult);
await liveRefresh;
assert.equal(live.data.activity.title, "新现场");
assert.equal(live.data.refreshing, false);

const failedRefresh = live.load();
liveRequests[2].reject(new Error("network"));
liveRequests[3].resolve(statsResult);
await failedRefresh;
assert.equal(live.data.activity.title, "新现场");
assert.equal(live.data.message, "");
assert.ok(live.data.refreshError);

const olderRefresh = live.load();
const newerRefresh = live.load();
liveRequests[6].resolve(liveResult("最新现场"));
liveRequests[7].resolve(statsResult);
await newerRefresh;
liveRequests[4].resolve(liveResult("过期现场"));
liveRequests[5].resolve(statsResult);
await olderRefresh;
assert.equal(live.data.activity.title, "最新现场");

live.load = async () => {};
const firstMatchAction = live.run("score.submit", { matchId: "match-1" }, "ok");
assert.equal(live.data.pendingActions["match:match-1"], true);
assert.equal(await live.run("score.confirm", { matchId: "match-1" }, "ok"), false);
const secondMatchAction = live.run("score.submit", { matchId: "match-2" }, "ok");
assert.equal(liveRequests.length, 10);
liveRequests[8].resolve({});
liveRequests[9].resolve({});
assert.deepEqual(await Promise.all([firstMatchAction, secondMatchAction]), [true, true]);
assert.equal(live.data.pendingActions["match:match-1"], false);
assert.equal(live.data.pendingActions["match:match-2"], false);

const failedAction = live.run("score.lock", { matchId: "match-1" }, "ok");
liveRequests[10].reject(new Error("network"));
assert.equal(await failedAction, false);
assert.equal(live.data.pendingActions["match:match-1"], false);
assert.equal(liveToasts.at(-1), "操作失败");

const roundAction = live.run("grouping.publish", { roundId: "round-1" }, "ok");
assert.equal(live.data.pendingActions["round:round-1"], true);
assert.equal(await live.run("grouping.publish", { roundId: "round-1" }, "ok"), false);
liveRequests[11].resolve({});
assert.equal(await roundAction, true);
assert.equal(live.data.pendingActions["round:round-1"], false);

const initialRequests = [];
const { instance: initialLive } = page("apps/miniprogram/pages/activities/live.ts", {
  callCloud: (_action, payload) =>
    new Promise((resolve, reject) => initialRequests.push({ payload, resolve, reject })),
  wx: {
    showToast: () => {},
    setNavigationBarTitle: () => {},
  },
});
initialLive.activityId = "activity-1";
initialLive.isVisible = true;
const initialLoad = initialLive.load();
assert.equal(initialLive.data.loading, true);
initialRequests[0].reject(new Error("network"));
initialRequests[1].resolve(statsResult);
await initialLoad;
assert.equal(initialLive.data.loading, false);
assert.ok(initialLive.data.message);
assert.equal(initialLive.data.refreshError, "");

const retriedLoad = initialLive.retry();
initialRequests[2].resolve(liveResult("重试成功"));
initialRequests[3].resolve(statsResult);
await retriedLoad;
assert.equal(initialLive.data.activity.title, "重试成功");
assert.equal(initialLive.data.message, "");

const draftRequests = [];
const { instance: draftLive } = page("apps/miniprogram/pages/activities/live.ts", {
  callCloud: (_action, payload) =>
    new Promise((resolve, reject) => draftRequests.push({ payload, resolve, reject })),
  wx: {
    showToast: () => {},
    setNavigationBarTitle: () => {},
  },
});
draftLive.activityId = "activity-1";
draftLive.isVisible = true;
draftLive.data.loading = false;
draftLive.data.activity = { ...live.data.activity };
draftLive.data.matches = [
  {
    id: "match-1",
    roundId: "round-1",
    courtLabel: "一号场",
    teamA: [],
    teamB: [],
    matchType: "DOUBLES",
    status: "SCHEDULED",
    scoreA: 21,
    scoreB: 18,
    confirmations: [],
    version: 1,
    teamAText: "A",
    teamBText: "B",
    statusText: "待开打",
    inputScoreA: "21",
    inputScoreB: "18",
    isPlayer: false,
    confirmationText: "",
  },
];
draftLive.onScoreInput({
  currentTarget: { dataset: { index: "0", side: "A" } },
  detail: { value: "30" },
});
assert.equal(draftLive.data.matches[0].inputScoreA, "30");
const draftRefresh = draftLive.load();
draftRequests[0].resolve({
  ...liveResult("草稿刷新"),
  matches: [
    {
      id: "match-1",
      roundId: "round-1",
      courtLabel: "一号场",
      teamA: [],
      teamB: [],
      matchType: "DOUBLES",
      status: "SCHEDULED",
      scoreA: 21,
      scoreB: 18,
      confirmations: [],
      version: 1,
    },
  ],
});
draftRequests[1].resolve(statsResult);
await draftRefresh;
assert.equal(draftLive.data.matches[0].inputScoreA, "30");
assert.equal(draftLive.data.matches[0].inputScoreB, "18");

const liveTemplate = readFileSync("apps/miniprogram/pages/activities/live.wxml", "utf8");
assert.ok(!liveTemplate.includes("submitting"));
assert.ok(liveTemplate.includes("refreshError"));
assert.ok(liveTemplate.includes("disabled=\"{{pendingActions['match:' + item.id]}}\""));
assert.ok(liveTemplate.includes("disabled=\"{{pendingActions['round:' + item.id]}}\""));

console.log(
  "Page experience verified: stale search, combined filters, draft copy, duplicate publish protection, silent live refresh and per-match action locking",
);
