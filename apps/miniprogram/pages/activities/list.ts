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

function registrationLabel(status: string | null): string {
  if (status === "CONFIRMED") return "你已报名";
  if (status === "WAITLISTED") return "你在候补中";
  return "";
}

Page({
  data: {
    loading: true,
    activities: [] as Array<
      Activity & {
        timeText: string;
        levelText: string;
        shortDay: string;
        shortClock: string;
        registrationText: string;
      }
    >,
    viewActivities: [] as Array<
      Activity & {
        timeText: string;
        levelText: string;
        shortDay: string;
        shortClock: string;
        registrationText: string;
      }
    >,
    keyword: "",
    message: "",
  },

  onSearchInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const keyword = event.detail.value.trim().toLowerCase();
    this.setData({
      keyword: event.detail.value,
      viewActivities: keyword
        ? this.data.activities.filter((item) =>
            `${item.title} ${item.venue.name} ${item.locationHint ?? ""} ${item.levelText}`
              .toLowerCase()
              .includes(keyword),
          )
        : this.data.activities,
    });
  },

  async onShow() {
    try {
      const result = await callCloud<{ activities: Activity[] }>("activity.list");
      const activities = result.activities.map((activity) => {
        const date = new Date(activity.startAt);
        const now = new Date();
        const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const sameDay = date.toDateString() === now.toDateString();
        const isTomorrow = date.toDateString() === tomorrow.toDateString();
        return {
          ...activity,
          timeText: formatChinaDateTime(activity.startAt),
          levelText: levelLabel(activity.level),
          registrationText: registrationLabel(activity.currentRegistrationStatus),
          shortDay: sameDay
            ? "今天"
            : isTomorrow
              ? "明天"
              : `${date.getMonth() + 1}/${date.getDate()}`,
          shortClock: `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
        };
      });
      this.setData({
        loading: false,
        message: "",
        activities,
        viewActivities: activities,
      });
    } catch {
      this.setData({ loading: false, message: "球局加载失败，请稍后重试" });
    }
  },
});
