import { callCloud } from "../../services/cloud-api";
import { formatChinaDateTime } from "../../utils/date";
import { levelLabel } from "../../utils/labels";
import { appearanceView, applyNativeAppearance, loadAppearanceState } from "../../utils/appearance";
import { normalizeActivitySearchKeyword } from "../../utils/activity-search";

type Activity = {
  id: string;
  title: string;
  venue: { name: string };
  startAt: string;
  capacity: number;
  registeredCount: number;
  waitlistCount: number;
  currentRegistrationStatus: string | null;
  level: string;
  locationHint: string | null;
};

type ActivityView = Activity & {
  timeText: string;
  levelText: string;
  shortDay: string;
  shortClock: string;
  registrationText: string;
};

type FilterKey = "all" | "today" | "tomorrow" | "gdut" | "improving" | "casual";

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "全部" },
  { key: "today", label: "今天" },
  { key: "tomorrow", label: "明天" },
  { key: "gdut", label: "广工" },
  { key: "improving", label: "进阶" },
  { key: "casual", label: "娱乐" },
];

function registrationLabel(status: string | null): string {
  if (status === "CONFIRMED") return "你已报名";
  if (status === "WAITLISTED") return "你在候补中";
  return "";
}

function isSameCalendarDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function matchesFilter(activity: ActivityView, filter: FilterKey, now: Date): boolean {
  if (filter === "all") return true;
  if (filter === "today") return isSameCalendarDay(new Date(activity.startAt), now);
  if (filter === "tomorrow") {
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return isSameCalendarDay(new Date(activity.startAt), tomorrow);
  }
  if (filter === "gdut") {
    return (
      `${activity.title} ${activity.venue.name} ${activity.locationHint ?? ""}`
        .toLowerCase()
        .match(/广东工业大学|广工/) !== null
    );
  }
  if (filter === "improving") return activity.level === "IMPROVING";
  return activity.level === "CASUAL";
}

function filterActivities(
  activities: ActivityView[],
  keyword: string,
  filter: FilterKey,
): ActivityView[] {
  const normalizedKeyword = keyword.trim().toLowerCase();
  const now = new Date();
  return activities.filter((activity) => {
    if (!matchesFilter(activity, filter, now)) return false;
    if (!normalizedKeyword) return true;
    return (
      activity.title +
      " " +
      activity.venue.name +
      " " +
      (activity.locationHint ?? "") +
      " " +
      activity.levelText
    )
      .toLowerCase()
      .includes(normalizedKeyword);
  });
}

function activityView(activity: Activity): ActivityView {
  const date = new Date(activity.startAt);
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return {
    ...activity,
    timeText: formatChinaDateTime(activity.startAt),
    levelText: levelLabel(activity.level),
    registrationText: registrationLabel(activity.currentRegistrationStatus),
    shortDay: isSameCalendarDay(date, now)
      ? "今天"
      : isSameCalendarDay(date, tomorrow)
        ? "明天"
        : `${String(date.getMonth() + 1)}/${String(date.getDate())}`,
    shortClock: `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
  };
}

Page({
  searchTimer: null as number | null,
  listRequestVersion: 0,
  data: {
    loading: true,
    loadingMore: false,
    nextOffset: null as number | null,
    activities: [] as ActivityView[],
    viewActivities: [] as ActivityView[],
    filters: FILTERS,
    activeFilter: "all" as FilterKey,
    keyword: "",
    message: "",
    ...appearanceView(),
  },

  onLoad(options: Record<string, string | undefined>) {
    const keyword = normalizeActivitySearchKeyword(
      typeof options.keyword === "string" ? options.keyword : "",
    );
    if (keyword) this.setData({ keyword });
  },

  onSearchInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const keyword = event.detail.value.slice(0, 50);
    this.listRequestVersion += 1;
    this.setData({
      keyword,
      viewActivities: filterActivities(
        this.data.activities,
        keyword,
        this.data.activeFilter as FilterKey,
      ),
    });
    if (this.searchTimer !== null) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null;
      void this.load(true);
    }, 300) as unknown as number;
  },

  confirmSearch() {
    if (this.searchTimer !== null) clearTimeout(this.searchTimer);
    this.searchTimer = null;
    this.listRequestVersion += 1;
    void this.load(true);
  },

  onFilterTap(event: WechatMiniprogram.TouchEvent) {
    const activeFilter = String(event.currentTarget.dataset.key) as FilterKey;
    if (!FILTERS.some((filter) => filter.key === activeFilter)) return;
    this.setData({
      activeFilter,
      viewActivities: filterActivities(this.data.activities, this.data.keyword, activeFilter),
    });
  },

  async onShow() {
    const appearance = loadAppearanceState();
    applyNativeAppearance(appearance.preferences);
    this.setData(appearanceView(appearance.preferences));
    await this.load(true);
  },

  onUnload() {
    if (this.searchTimer !== null) clearTimeout(this.searchTimer);
  },

  async onReachBottom() {
    if (this.data.nextOffset !== null && !this.data.loadingMore) await this.load(false);
  },

  async retry() {
    await this.load(true);
  },

  async load(reset: boolean) {
    const offset = reset ? 0 : this.data.nextOffset;
    if (offset === null) return;
    const requestVersion = reset ? ++this.listRequestVersion : this.listRequestVersion;
    const keyword = normalizeActivitySearchKeyword(this.data.keyword);
    this.setData(reset ? { loading: true, message: "" } : { loadingMore: true, message: "" });
    try {
      const result = await callCloud<{ activities: Activity[]; nextOffset: number | null }>(
        "activity.list",
        { offset, limit: 20, keyword },
      );
      if (
        requestVersion !== this.listRequestVersion ||
        keyword !== normalizeActivitySearchKeyword(this.data.keyword)
      )
        return;
      const page = result.activities.map(activityView);
      const activities = reset ? page : [...this.data.activities, ...page];
      this.setData({
        loading: false,
        loadingMore: false,
        message: "",
        activities,
        nextOffset: result.nextOffset,
        viewActivities: filterActivities(
          activities,
          this.data.keyword,
          this.data.activeFilter as FilterKey,
        ),
      });
    } catch {
      if (requestVersion !== this.listRequestVersion) return;
      this.setData({
        loading: false,
        loadingMore: false,
        message: "球局加载失败，请稍后重试",
      });
    }
  },
});
