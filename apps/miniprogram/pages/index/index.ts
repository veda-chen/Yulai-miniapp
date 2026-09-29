import { callCloud } from "../../services/cloud-api";
import { activitySearchListUrl, normalizeActivitySearchKeyword } from "../../utils/activity-search";
import {
  type AppearancePreferences,
  appearanceView,
  applyNativeAppearance,
  type HomeModuleId,
  loadAppearanceState,
  type ToolId,
} from "../../utils/appearance";
import { TOOL_DEFINITIONS, visibleToolIds } from "../../utils/tool-registry";

type SessionData = {
  user: {
    id: string;
    isNew: boolean;
  };
};

type ProfileData = {
  user: {
    nickname: string | null;
    needsProfile: boolean;
  };
};

type Activity = {
  id: string;
  title: string;
  startAt: string;
  capacity: number;
  registeredCount: number;
  waitlistCount: number;
  currentRegistrationStatus: string | null;
  level: string;
  venue: { name: string };
  isOrganizer?: boolean;
};
type Venue = { id: string; name: string; address: string | null; verificationStatus: string };

type ActivityView = Activity & {
  shortTime: string;
  shortDate: string;
  levelText: string;
  registrationText: string;
};

const LEVEL_NAMES: Record<string, string> = {
  ANY: "不限水平",
  CASUAL: "休闲局",
  BEGINNER: "新手局",
  IMPROVING: "进阶局",
  COMPETITIVE: "对抗局",
};

function dateParts(value: string) {
  const date = new Date(value);
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return {
    shortTime: `${weekdays[date.getDay()]} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
    shortDate: `${date.getMonth() + 1}月${date.getDate()}日`,
  };
}

function activityView(activity: Activity): ActivityView {
  const hasSpace = activity.registeredCount < activity.capacity;
  return {
    ...activity,
    ...dateParts(activity.startAt),
    levelText: LEVEL_NAMES[activity.level] ?? "不限水平",
    registrationText: activity.isOrganizer
      ? "我发起的"
      : activity.currentRegistrationStatus === "WAITLISTED"
        ? "候补中"
        : activity.currentRegistrationStatus === "CONFIRMED"
          ? "已报名"
          : hasSpace
            ? "报名中"
            : "可候补",
  };
}

Page({
  searchTimer: null as number | null,
  homeRequestVersion: 0,
  myActivitiesRequestVersion: 0,
  recommendationsRequestVersion: 0,
  venuesRequestVersion: 0,
  unreadRequestVersion: 0,
  pageActive: false,
  data: {
    greeting: "你好",
    userName: "球友",
    dateText: "",
    activities: [] as ActivityView[],
    myActivitiesLoading: true,
    myActivitiesMessage: "",
    recommendedActivities: [] as ActivityView[],
    searchKeyword: "",
    displayedSearchKeyword: "",
    recommendationsNextOffset: null as number | null,
    recommendationsLoading: true,
    recommendationsMessage: "",
    hasUnread: false,
    ...appearanceView(),
    homeModules: [] as Array<{ id: HomeModuleId }>,
    homeTools: [] as Array<(typeof TOOL_DEFINITIONS)[ToolId]>,
    favoriteVenues: [] as Venue[],
    venueMessage: "",
  },

  onLoad() {
    const now = new Date();
    const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
    const hour = now.getHours();
    this.setData({
      greeting: hour < 11 ? "早安" : hour < 18 ? "下午好" : "晚上好",
      dateText: `${now.getMonth() + 1}月${now.getDate()}日 ${weekdays[now.getDay()]}`,
    });
  },

  onSearchInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const searchKeyword = event.detail.value.slice(0, 50);
    this.recommendationsRequestVersion += 1;
    const changed =
      normalizeActivitySearchKeyword(searchKeyword) !== this.data.displayedSearchKeyword;
    this.setData({
      searchKeyword,
      recommendationsLoading: true,
      recommendationsMessage: "",
      ...(changed ? { recommendedActivities: [], recommendationsNextOffset: null } : {}),
    });
    this.cancelPendingSearch();
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null;
      void this.loadRecommendations();
    }, 300) as unknown as number;
  },

  clearSearch() {
    this.cancelPendingSearch();
    this.recommendationsRequestVersion += 1;
    this.setData({ searchKeyword: "" });
    void this.loadRecommendations();
  },

  confirmSearch() {
    this.cancelPendingSearch();
    this.recommendationsRequestVersion += 1;
    void this.loadRecommendations();
  },

  cancelPendingSearch() {
    if (this.searchTimer !== null) clearTimeout(this.searchTimer);
    this.searchTimer = null;
  },

  openAllSearchResults() {
    wx.navigateTo({ url: activitySearchListUrl(this.data.searchKeyword) });
  },

  async retryRecommendations() {
    await this.loadRecommendations();
  },

  async retryMyActivities() {
    await this.loadMyActivities();
  },

  async loadMyActivities() {
    const requestVersion = ++this.myActivitiesRequestVersion;
    this.setData({ myActivitiesLoading: true, myActivitiesMessage: "" });
    try {
      const result = await callCloud<{ activities: Activity[] }>("activity.mine", { limit: 10 });
      if (requestVersion !== this.myActivitiesRequestVersion) return;
      this.setData({
        activities: result.activities.map(activityView),
        myActivitiesLoading: false,
      });
    } catch {
      if (requestVersion !== this.myActivitiesRequestVersion) return;
      this.setData({
        myActivitiesLoading: false,
        myActivitiesMessage: "请检查网络后重试",
      });
    }
  },

  async loadRecommendations() {
    this.cancelPendingSearch();
    const requestVersion = ++this.recommendationsRequestVersion;
    const keyword = normalizeActivitySearchKeyword(this.data.searchKeyword);
    this.setData({
      recommendationsLoading: true,
      recommendationsMessage: "",
      ...(keyword !== this.data.displayedSearchKeyword
        ? { recommendedActivities: [], recommendationsNextOffset: null }
        : {}),
    });
    try {
      const activityData = await callCloud<{
        activities: Activity[];
        nextOffset: number | null;
      }>("activity.list", {
        limit: 10,
        keyword,
      });
      if (
        requestVersion !== this.recommendationsRequestVersion ||
        keyword !== normalizeActivitySearchKeyword(this.data.searchKeyword)
      )
        return;
      const publicActivities = activityData.activities.map(activityView);
      this.setData({
        recommendedActivities: publicActivities,
        displayedSearchKeyword: keyword,
        recommendationsNextOffset: activityData.nextOffset,
        recommendationsLoading: false,
      });
    } catch {
      if (requestVersion !== this.recommendationsRequestVersion) return;
      this.setData({
        recommendationsLoading: false,
        recommendationsMessage: "请检查网络后重试",
      });
    }
  },

  async loadUnreadSummary() {
    const requestVersion = ++this.unreadRequestVersion;
    try {
      const result = await callCloud<{ hasUnread: boolean }>("notification.unreadSummary");
      if (!this.pageActive || requestVersion !== this.unreadRequestVersion) return;
      this.setData({ hasUnread: result.hasUnread });
    } catch {}
  },

  async onShow() {
    this.pageActive = true;
    const requestVersion = ++this.homeRequestVersion;
    const state = loadAppearanceState();
    const preferences = state.preferences;
    applyNativeAppearance(preferences);
    this.applyPreferences(preferences);
    const recommendations = this.loadRecommendations();
    const venues = this.loadFavoriteVenues(preferences);
    try {
      await callCloud<SessionData>("auth.session");
      const [profileResult] = await Promise.allSettled([
        callCloud<ProfileData>("user.getMe"),
        this.loadMyActivities(),
        this.loadUnreadSummary(),
      ]);
      if (requestVersion === this.homeRequestVersion && profileResult.status === "fulfilled") {
        this.setData({ userName: profileResult.value.user.nickname ?? "球友" });
      }
    } catch {
      if (requestVersion !== this.homeRequestVersion) return;
      this.setData({
        myActivitiesLoading: false,
        myActivitiesMessage: "登录状态暂时不可用，请稍后重试",
      });
    }
    await Promise.allSettled([recommendations, venues]);
  },

  async onPullDownRefresh() {
    this.cancelPendingSearch();
    this.recommendationsRequestVersion += 1;
    const preferences = loadAppearanceState().preferences;
    await Promise.allSettled([
      this.loadMyActivities(),
      this.loadRecommendations(),
      this.loadUnreadSummary(),
      this.loadFavoriteVenues(preferences),
    ]);
    wx.stopPullDownRefresh();
  },

  onUnload() {
    this.onHide();
  },

  onHide() {
    this.pageActive = false;
    this.cancelPendingSearch();
    this.unreadRequestVersion += 1;
    this.homeRequestVersion += 1;
    this.myActivitiesRequestVersion += 1;
    this.recommendationsRequestVersion += 1;
    this.venuesRequestVersion += 1;
  },

  onAppearanceSynced(preferences: AppearancePreferences) {
    this.applyPreferences(preferences);
    void this.loadFavoriteVenues(preferences);
  },

  applyPreferences(preferences: AppearancePreferences) {
    this.setData({
      ...appearanceView(preferences),
      homeModules: preferences.moduleOrder
        .filter((id) => preferences.visibleModules.includes(id))
        .map((id) => ({ id })),
      homeTools: visibleToolIds(preferences.toolOrder, preferences.homeToolIds).map(
        (id) => TOOL_DEFINITIONS[id],
      ),
      favoriteVenues: [],
      venueMessage: "",
    });
  },

  async loadFavoriteVenues(preferences = loadAppearanceState().preferences) {
    const requestVersion = ++this.venuesRequestVersion;
    if (!preferences.visibleModules.includes("venues") || preferences.favoriteVenueIds.length === 0)
      return;
    try {
      const result = await callCloud<{ venues: Venue[] }>("venue.list");
      if (requestVersion !== this.venuesRequestVersion) return;
      const byId = new Map(result.venues.map((venue) => [venue.id, venue]));
      const favoriteVenues = preferences.favoriteVenueIds.flatMap((id) => {
        const venue = byId.get(id);
        return venue ? [venue] : [];
      });
      this.setData({
        favoriteVenues,
        venueMessage: favoriteVenues.length ? "" : "常用场馆已不可用，请到个性化设置中更新",
      });
    } catch {
      if (requestVersion !== this.venuesRequestVersion) return;
      this.setData({ venueMessage: "常用场馆加载失败，其他首页内容不受影响" });
    }
  },
});
