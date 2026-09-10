import { callCloud } from "../../services/cloud-api";
import { formatChinaDateTime } from "../../utils/date";

type Notification = {
  id: string;
  activityId: string | null;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
};

Page({
  data: { loading: true, notifications: [] as Array<Notification & { timeText: string }> },
  async onShow() {
    try {
      const result = await callCloud<{ notifications: Notification[] }>("notification.list");
      this.setData({
        loading: false,
        notifications: result.notifications.map((item) => ({
          ...item,
          timeText: formatChinaDateTime(item.createdAt),
        })),
      });
    } catch {
      this.setData({ loading: false, notifications: [] });
    }
  },
  async openNotification(event: WechatMiniprogram.TouchEvent) {
    const { id, activityId } = event.currentTarget.dataset as { id: string; activityId?: string };
    await callCloud("notification.markRead", { id });
    if (activityId) wx.navigateTo({ url: `/pages/activities/detail?id=${activityId}` });
    else await this.onShow();
  },
});
