import { callCloud } from "../../services/cloud-api";

type Participant = { userId: string; nickname: string; attendanceStatus: string };
type WaitingMember = { userId: string; nickname: string; position: number };
const LABELS: Record<string, string> = {
  PENDING: "待确认",
  CHECKED_IN: "已到场",
  ABSENT: "未到场",
  LEFT: "已离场",
};

Page({
  activityId: "",
  data: {
    participants: [] as Array<Participant & { statusText: string }>,
    waitlist: [] as WaitingMember[],
    canManage: false,
    loading: true,
  },
  onLoad(options: Record<string, string | undefined>) {
    this.activityId = options.id ?? "";
  },
  async onShow() {
    await this.load();
  },
  async load() {
    try {
      const result = await callCloud<{
        participants: Participant[];
        waitlist: WaitingMember[];
        canManage: boolean;
      }>("participant.list", { id: this.activityId });
      this.setData({
        loading: false,
        canManage: result.canManage,
        waitlist: result.waitlist,
        participants: result.participants.map((item) => ({
          ...item,
          statusText: LABELS[item.attendanceStatus] ?? item.attendanceStatus,
        })),
      });
    } catch {
      this.setData({ loading: false, participants: [] });
    }
  },
  async changeAttendance(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.canManage) return;
    const userId = String(event.currentTarget.dataset.userId);
    const selection = await wx.showActionSheet({
      itemList: ["已到场", "未到场", "已离场", "待确认"],
    });
    const statuses = ["CHECKED_IN", "ABSENT", "LEFT", "PENDING"];
    await callCloud("participant.setAttendance", {
      activityId: this.activityId,
      userId,
      attendanceStatus: statuses[selection.tapIndex],
    });
    await this.load();
  },
  async promote(event: WechatMiniprogram.TouchEvent) {
    const userId = String(event.currentTarget.dataset.userId);
    try {
      await callCloud("registration.promote", { activityId: this.activityId, userId });
      wx.showToast({ title: "已补入正式名单", icon: "success" });
      await this.load();
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : "递补失败",
        icon: "none",
      });
    }
  },
});
