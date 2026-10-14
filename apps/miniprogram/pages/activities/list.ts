import { callCloud } from "../../services/cloud-api";
import { chinaDayRange, formatChinaDateTime, toChinaFormValue } from "../../utils/date";
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
  currentRegistrationStatus: string | null;
  level: string;
  organizer: { nickname: string };
};
type ActivityView = Activity & {
  timeText: string;
  levelText: string;
  shortDay: string;
  shortClock: string;
  registrationText: string;
};
type Venue = { id: string; name: string };
type DayFilter = "all" | "today" | "tomorrow";
const DAYS: Array<{ key: DayFilter; label: string }> = [
  { key: "all", label: "不限日期" },
  { key: "today", label: "今天" },
  { key: "tomorrow", label: "明天" },
];
const LEVELS = [
  { value: "", label: "不限水平" },
  { value: "CASUAL", label: "休闲" },
  { value: "BEGINNER", label: "新手" },
  { value: "IMPROVING", label: "进阶" },
  { value: "COMPETITIVE", label: "对抗" },
];

function activityView(activity: Activity): ActivityView {
  const china = toChinaFormValue(activity.startAt);
  const today = toChinaFormValue(new Date().toISOString()).date;
  const tomorrow = toChinaFormValue(chinaDayRange(1).startAtFrom).date;
  return {
    ...activity,
    timeText: formatChinaDateTime(activity.startAt),
    levelText: levelLabel(activity.level),
    registrationText:
      activity.currentRegistrationStatus === "CONFIRMED"
        ? "你已报名"
        : activity.currentRegistrationStatus === "WAITLISTED"
          ? "你在候补中"
          : "",
    shortDay:
      china.date === today
        ? "今天"
        : china.date === tomorrow
          ? "明天"
          : china.date.slice(5).replace("-", "/"),
    shortClock: china.time,
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
    keyword: "",
    displayedKeyword: "",
    dayFilters: DAYS,
    dayFilter: "all" as DayFilter,
    venues: [{ id: "", name: "不限场馆" }] as Venue[],
    venueIndex: 0,
    levels: LEVELS,
    levelIndex: 0,
    hasSpots: false,
    filterSummary: "全部公开球局",
    displayedFilterSummary: "",
    message: "",
    ...appearanceView(),
  },
  onLoad(options: Record<string, string | undefined>) {
    const keyword = normalizeActivitySearchKeyword(options.keyword ?? "");
    if (keyword) this.setData({ keyword });
  },
  async onShow() {
    const appearance = loadAppearanceState();
    applyNativeAppearance(appearance.preferences);
    this.setData(appearanceView(appearance.preferences));
    const venueTask = callCloud<{ venues: Venue[] }>("venue.list")
      .then((result) => {
        const selectedId = this.data.venues[this.data.venueIndex]?.id;
        const venues = [{ id: "", name: "不限场馆" }, ...result.venues];
        this.setData({
          venues,
          venueIndex: Math.max(
            0,
            venues.findIndex((venue) => venue.id === selectedId),
          ),
        });
      })
      .catch(() => {
        // Keyword and other filters remain available if venue metadata fails.
      });
    await Promise.all([this.load(true), venueTask]);
  },
  onUnload() {
    this.cancelSearch();
    this.listRequestVersion += 1;
  },
  cancelSearch() {
    if (this.searchTimer !== null) clearTimeout(this.searchTimer);
    this.searchTimer = null;
  },
  onSearchInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.cancelSearch();
    this.listRequestVersion += 1;
    const keyword = event.detail.value.slice(0, 50);
    this.setData({
      keyword,
      loading: true,
      ...(normalizeActivitySearchKeyword(keyword) !== this.data.displayedKeyword
        ? {
            activities: [],
            nextOffset: null,
            filterSummary: keyword ? `“${keyword}” · 正在搜索` : "公开球局 · 正在搜索",
          }
        : {}),
    });
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null;
      void this.load(true);
    }, 300) as unknown as number;
  },
  confirmSearch() {
    this.cancelSearch();
    void this.load(true);
  },
  clearSearch() {
    this.cancelSearch();
    this.setData({ keyword: "" });
    void this.load(true);
  },
  resetFilters() {
    this.cancelSearch();
    this.setData({ keyword: "", dayFilter: "all", venueIndex: 0, levelIndex: 0, hasSpots: false });
    void this.load(true);
  },
  onDayTap(event: WechatMiniprogram.TouchEvent) {
    const dayFilter = event.currentTarget.dataset.key as DayFilter;
    if (!DAYS.some((day) => day.key === dayFilter) || dayFilter === this.data.dayFilter) return;
    this.cancelSearch();
    this.setData({ dayFilter });
    void this.load(true);
  },
  onVenueChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.cancelSearch();
    this.setData({ venueIndex: Number(event.detail.value) });
    void this.load(true);
  },
  onLevelChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.cancelSearch();
    this.setData({ levelIndex: Number(event.detail.value) });
    void this.load(true);
  },
  onSpotsChange(event: WechatMiniprogram.CustomEvent<{ value: boolean }>) {
    this.cancelSearch();
    this.setData({ hasSpots: event.detail.value });
    void this.load(true);
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
    const venue = this.data.venues[this.data.venueIndex];
    const level = LEVELS[this.data.levelIndex];
    const day = this.data.dayFilter as DayFilter;
    const range = day === "all" ? {} : chinaDayRange(day === "today" ? 0 : 1);
    const filterSummary = [
      keyword ? `“${keyword}”` : "公开球局",
      day === "all" ? "" : day === "today" ? "今天" : "明天",
      venue?.id ? venue.name : "",
      level?.value ? level.label : "",
      this.data.hasSpots ? "仅看有名额" : "",
    ]
      .filter(Boolean)
      .join(" · ");
    this.setData(
      reset
        ? {
            loading: true,
            message: "",
            filterSummary,
            ...(filterSummary !== this.data.displayedFilterSummary
              ? { activities: [], nextOffset: null }
              : {}),
          }
        : { loadingMore: true, message: "" },
    );
    try {
      const result = await callCloud<{ activities: Activity[]; nextOffset: number | null }>(
        "activity.list",
        {
          offset,
          limit: 20,
          keyword,
          ...range,
          ...(venue?.id ? { venueId: venue.id } : {}),
          ...(level?.value ? { level: level.value } : {}),
          ...(this.data.hasSpots ? { hasSpots: true } : {}),
        },
      );
      if (requestVersion !== this.listRequestVersion) return;
      const page = result.activities.map(activityView);
      const update: Record<string, unknown> = {
        loading: false,
        loadingMore: false,
        message: "",
        displayedKeyword: keyword,
        displayedFilterSummary: filterSummary,
        nextOffset: result.nextOffset,
      };
      if (reset) update.activities = page;
      else {
        const seen = new Set(this.data.activities.map((item) => item.id));
        const additions = page.filter((item) => !seen.has(item.id));
        additions.forEach((item, index) => {
          update[`activities[${this.data.activities.length + index}]`] = item;
        });
      }
      this.setData(update);
    } catch {
      if (requestVersion !== this.listRequestVersion) return;
      this.setData({ loading: false, loadingMore: false, message: "球局加载失败，请稍后重试" });
    }
  },
});
