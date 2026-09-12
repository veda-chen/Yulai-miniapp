import { callCloud } from "../../services/cloud-api";
import { formatChinaDateTime } from "../../utils/date";

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
    message: "",
    activities: [] as Array<
      Activity & { timeText: string; statusText: string; participationText: string }
    >,
  },

  async onShow() {
    await this.load();
  },

  async onPullDownRefresh() {
    await this.load();
    wx.stopPullDownRefresh();
  },

  async load() {
    try {
      this.setData({ loading: true, message: "" });
      const result = await callCloud<{ activities: Activity[] }>("activity.history");
      this.setData({
        loading: false,
        activities: result.activities.map((activity) => ({
          ...activity,
          timeText: formatChinaDateTime(activity.startAt),
          statusText: ACTIVITY_STATUS[activity.status] ?? "历史球局",
          participationText:
            REGISTRATION_STATUS[activity.currentRegistrationStatus ?? ""] ?? "参加记录",
        })),
      });
    } catch (error) {
      this.setData({
        loading: false,
        message: error instanceof Error ? error.message : "参加记录加载失败",
      });
    }
  },
});
