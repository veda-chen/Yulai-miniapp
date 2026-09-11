import { callCloud } from "../../services/cloud-api";
import { formatChinaDateTime } from "../../utils/date";
import { levelLabel } from "../../utils/labels";

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

Page({
  data: {
    loading: true,
    activities: [] as ActivityView[],
    viewActivities: [] as ActivityView[],
    filters: FILTERS,
    activeFilter: "all" as FilterKey,
    keyword: "",
    message: "",
  },

  onSearchInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const keyword = event.detail.value;
    this.setData({
      keyword,
      viewActivities: filterActivities(
        this.data.activities,
        keyword,
        this.data.activeFilter as FilterKey,
      ),
    });
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
    try {
      const result = await callCloud<{ activities: Activity[] }>("activity.list");
      const activities = result.activities.map((activity) => {
        const date = new Date(activity.startAt);
        const now = new Date();
        const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const sameDay = isSameCalendarDay(date, now);
        const isTomorrow = isSameCalendarDay(date, tomorrow);
        return {
          ...activity,
          timeText: formatChinaDateTime(activity.startAt),
          levelText: levelLabel(activity.level),
          registrationText: registrationLabel(activity.currentRegistrationStatus),
          shortDay: sameDay
            ? "今天"
            : isTomorrow
              ? "明天"
              : `${String(date.getMonth() + 1)}/${String(date.getDate())}`,
          shortClock:
            String(date.getHours()).padStart(2, "0") +
            ":" +
            String(date.getMinutes()).padStart(2, "0"),
        };
      });
      this.setData({
        loading: false,
        message: "",
        activities,
        viewActivities: filterActivities(
          activities,
          this.data.keyword,
          this.data.activeFilter as FilterKey,
        ),
      });
    } catch {
      this.setData({ loading: false, message: "球局加载失败，请稍后重试" });
    }
  },
});
