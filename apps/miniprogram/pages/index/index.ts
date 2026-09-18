import { callCloud } from "../../services/cloud-api";
import { filterRecommendedActivities } from "../../utils/activity-recommendations";
import {
  appearanceView,
  applyNativeAppearance,
  loadAppearanceState,
  type HomeModuleId,
  type ToolId,
} from "../../utils/appearance";

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
};
type Venue = { id: string; name: string; address: string | null; verificationStatus: string };

type ActivityView = Activity & {
  shortTime: string;
  shortDate: string;
  levelText: string;
  registrationText: string;
};

const TOOL_DATA: Record<
  ToolId,
  { id: ToolId; title: string; description: string; icon: string; tone: string; url: string }
> = {
  grouping: {
    id: "grouping",
    title: "快速分组",
    description: "生成单打或双打分组",
    icon: "组",
    tone: "blue",
    url: "/pages/tools/grouping",
  },
  scoring: {
    id: "scoring",
    title: "临时计分",
    description: "21分制，支持撤回",
    icon: "分",
    tone: "green",
    url: "/pages/tools/scoring",
  },
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
    registrationText:
      activity.currentRegistrationStatus === "WAITLISTED"
        ? "候补中"
        : activity.currentRegistrationStatus === "CONFIRMED"
          ? "已报名"
          : hasSpace
            ? "报名中"
            : "可候补",
  };
}

Page({
  data: {
    greeting: "你好",
    userName: "球友",
    dateText: "",
    activities: [] as ActivityView[],
    publicActivities: [] as ActivityView[],
    recommendedActivities: [] as ActivityView[],
    searchKeyword: "",
    recommendationsLoading: true,
    recommendationsMessage: "",
    ...appearanceView(),
    homeModules: [] as Array<{ id: HomeModuleId }>,
    homeTools: [] as Array<(typeof TOOL_DATA)[ToolId]>,
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
    const searchKeyword = event.detail.value;
    this.setData({
      searchKeyword,
      recommendedActivities: filterRecommendedActivities(this.data.publicActivities, searchKeyword),
    });
  },

  clearSearch() {
    this.setData({
      searchKeyword: "",
      recommendedActivities: filterRecommendedActivities(this.data.publicActivities, ""),
    });
  },

  async retryRecommendations() {
    await this.loadRecommendations();
  },

  async loadRecommendations() {
    this.setData({
      recommendationsLoading: true,
      recommendationsMessage: "",
      recommendedActivities: [],
    });
    try {
      const activityData = await callCloud<{ activities: Activity[] }>("activity.list");
      const publicActivities = activityData.activities.map(activityView);
      const activities = publicActivities
        .filter(
          (item) =>
            item.currentRegistrationStatus === "CONFIRMED" ||
            item.currentRegistrationStatus === "WAITLISTED",
        )
        .slice(0, 4);
      this.setData({
        activities,
        publicActivities,
        recommendedActivities: filterRecommendedActivities(
          publicActivities,
          this.data.searchKeyword,
        ),
        recommendationsLoading: false,
      });
    } catch {
      this.setData({
        recommendationsLoading: false,
        recommendationsMessage: "请检查网络后重试",
      });
    }
  },

  async onShow() {
    const state = loadAppearanceState();
    const preferences = state.preferences;
    applyNativeAppearance(preferences);
    this.setData({
      ...appearanceView(preferences),
      homeModules: preferences.moduleOrder
        .filter((id) => preferences.visibleModules.includes(id))
        .map((id) => ({ id })),
      homeTools: preferences.toolOrder.map((id) => TOOL_DATA[id]),
      favoriteVenues: [],
      venueMessage: "",
    });
    try {
      await callCloud<SessionData>("auth.session");
    } catch {}
    const [profileResult] = await Promise.allSettled([callCloud<ProfileData>("user.getMe")]);
    if (profileResult.status === "fulfilled") {
      this.setData({ userName: profileResult.value.user.nickname ?? "球友" });
    }
    await this.loadRecommendations();
    if (preferences.visibleModules.includes("venues") && preferences.favoriteVenueIds.length > 0) {
      try {
        const result = await callCloud<{ venues: Venue[] }>("venue.list");
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
        this.setData({ venueMessage: "常用场馆加载失败，其他首页内容不受影响" });
      }
    }
  },
});
