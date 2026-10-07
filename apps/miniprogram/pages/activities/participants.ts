import { callCloud } from "../../services/cloud-api";
import { appearanceView, applyNativeAppearance, loadAppearanceState } from "../../utils/appearance";

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
    message: "",
    submittingUserId: "",
    ...appearanceView(),
  },
  onLoad(options: Record<string, string | undefined>) {
    this.activityId = options.id ?? "";
  },
  async onShow() {
    const appearance = loadAppearanceState();
    applyNativeAppearance(appearance.preferences);
    this.setData(appearanceView(appearance.preferences));
    await this.load();
  },
  async load() {
    if (!this.activityId) {
      this.setData({ loading: false, message: "球局链接无效" });
      return;
    }
    this.setData({ loading: this.data.participants.length === 0, message: "" });
    try {
      const result = await callCloud<{
        participants: Participant[];
        waitlist: WaitingMember[];
        canManage: boolean;
      }>("participant.list", { id: this.activityId });
      this.setData({
        loading: false,
        message: "",
        canManage: result.canManage,
        waitlist: result.waitlist,
        participants: result.participants.map((item) => ({
          ...item,
          statusText: LABELS[item.attendanceStatus] ?? item.attendanceStatus,
        })),
      });
    } catch (error) {
      this.setData({
        loading: false,
        message: error instanceof Error ? error.message : "成员名单加载失败，请稍后重试",
      });
    }
  },
  async retry() {
    await this.load();
  },
  async changeAttendance(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.canManage || this.data.submittingUserId) return;
    const userId = String(event.currentTarget.dataset.userId);
    try {
      const selection = await wx.showActionSheet({
        itemList: ["已到场", "未到场", "已离场", "待确认"],
      });
      const statuses = ["CHECKED_IN", "ABSENT", "LEFT", "PENDING"];
      this.setData({ submittingUserId: userId });
      await callCloud("participant.setAttendance", {
        activityId: this.activityId,
        userId,
        attendanceStatus: statuses[selection.tapIndex],
      });
      await this.load();
    } catch (error) {
      if (error instanceof Error && !error.message.includes("cancel"))
        wx.showToast({ title: error.message || "修改失败", icon: "none" });
    } finally {
      this.setData({ submittingUserId: "" });
    }
  },
  async promote(event: WechatMiniprogram.TouchEvent) {
    if (this.data.submittingUserId) return;
    const userId = String(event.currentTarget.dataset.userId);
    this.setData({ submittingUserId: userId });
    try {
      await callCloud("registration.promote", { activityId: this.activityId, userId });
      wx.showToast({ title: "已补入正式名单", icon: "success" });
      await this.load();
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : "递补失败",
        icon: "none",
      });
    } finally {
      this.setData({ submittingUserId: "" });
    }
  },
});
