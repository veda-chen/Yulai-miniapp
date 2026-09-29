import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as search from "../apps/miniprogram/utils/activity-search.ts";

function page(path, overrides = {}) {
  let definition;
  const timers = new Map();
  let timerId = 0;
  const dependencies = {
    appearanceView: () => ({}),
    getDefaultActivityTimes: () => ({ startDate: "2099-01-01" }),
    ...search,
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
console.log(
  "Page experience verified: search scheduling, stale responses, retained retry, published draft protection",
);
