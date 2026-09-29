import { callCloud } from "../../services/cloud-api";
import { formatChinaDateTime } from "../../utils/date";
import { appearanceView, applyNativeAppearance, loadAppearanceState } from "../../utils/appearance";

type Activity = {
  id: string;
  title: string;
  venue: { name: string };
  startAt: string;
  status: string;
  currentRegistrationStatus: string | null;
};

const ACTIVITY_STATUS: Record<string, string> = {
  OPEN: "已过期",
  IN_PROGRESS: "进行中",
  ENDED: "已结束",
};

const REGISTRATION_STATUS: Record<string, string> = {
  CONFIRMED: "已报名",
  ATTENDED: "已参加",
  NO_SHOW: "未到场",
};

Page({
  data: {
    loading: true,
    loadingMore: false,
    nextOffset: null as number | null,
    message: "",
    activities: [] as Array<
      Activity & { timeText: string; statusText: string; participationText: string }
    >,
    ...appearanceView(),
  },

  async onShow() {
    const state = loadAppearanceState();
    applyNativeAppearance(state.preferences);
    this.setData(appearanceView(state.preferences));
    await this.load(true);
  },

  async onPullDownRefresh() {
    await this.load(true);
    wx.stopPullDownRefresh();
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
    try {
      this.setData(reset ? { loading: true, message: "" } : { loadingMore: true, message: "" });
      const result = await callCloud<{ activities: Activity[]; nextOffset: number | null }>(
        "activity.history",
        { offset, limit: 20 },
      );
      const page = result.activities.map((activity) => ({
        ...activity,
        timeText: formatChinaDateTime(activity.startAt),
        statusText: ACTIVITY_STATUS[activity.status] ?? "历史球局",
        participationText:
          REGISTRATION_STATUS[activity.currentRegistrationStatus ?? ""] ?? "参加记录",
      }));
      const activities = (reset ? page : [...this.data.activities, ...page]).sort(
        (left, right) => Date.parse(right.startAt) - Date.parse(left.startAt),
      );
      this.setData({
        loading: false,
        loadingMore: false,
        activities,
        nextOffset: result.nextOffset,
      });
    } catch (error) {
      this.setData({
        loading: false,
        loadingMore: false,
        message: error instanceof Error ? error.message : "参加记录加载失败",
      });
    }
  },
});
