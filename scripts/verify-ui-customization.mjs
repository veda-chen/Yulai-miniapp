import assert from "node:assert/strict";
import { filterRecommendedActivities } from "../apps/miniprogram/utils/activity-recommendations.ts";
import { DEFAULT_APPEARANCE, applyAppearancePreset } from "../apps/miniprogram/utils/appearance.ts";

const current = {
  ...DEFAULT_APPEARANCE,
  showHero: false,
  moduleOrder: ["venues", "tools"],
  visibleModules: ["tools", "venues"],
  toolOrder: ["scoring", "grouping"],
  favoriteVenueIds: ["venue-1", "venue-2"],
  syncEnabled: true,
};

const green = applyAppearancePreset(current, "green-court");
assert.equal(green.brand, "green");
assert.equal(green.heroStyle, "gradient");
assert.equal(green.scoreTheme, "court");
assert.equal(green.showHero, false);
assert.deepEqual(green.moduleOrder, ["venues", "tools"]);
assert.deepEqual(green.visibleModules, ["tools", "venues"]);
assert.deepEqual(green.toolOrder, ["scoring", "grouping"]);
assert.deepEqual(green.favoriteVenueIds, ["venue-1", "venue-2"]);
assert.equal(green.syncEnabled, true);

const activities = [
  {
    title: "广工进阶局",
    venue: { name: "广东工业大学体育馆" },
    levelText: "进阶局",
    currentRegistrationStatus: null,
  },
  {
    title: "已报名球局",
    venue: { name: "大学城体育馆" },
    levelText: "不限水平",
    currentRegistrationStatus: "CONFIRMED",
  },
  {
    title: "候补球局",
    venue: { name: "大学城体育馆" },
    levelText: "对抗局",
    currentRegistrationStatus: "WAITLISTED",
  },
];

assert.deepEqual(filterRecommendedActivities(activities, "广工"), [activities[0]]);
assert.deepEqual(filterRecommendedActivities(activities, "进阶"), [activities[0]]);
assert.deepEqual(filterRecommendedActivities(activities, ""), [activities[0]]);

console.log("UI customization behavior verified");
