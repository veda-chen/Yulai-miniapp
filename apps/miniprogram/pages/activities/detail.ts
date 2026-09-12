import { callCloud } from "../../services/cloud-api";
import { formatChinaDateTime } from "../../utils/date";
import { levelLabel } from "../../utils/labels";

type Activity = {
  id: string;
  title: string;
  venue: { name: string };
  organizer: { nickname: string };
  startAt: string;
  endAt: string;
  registrationDeadline: string;
  capacity: number;
  registeredCount: number;
  waitlistCount: number;
  level: string;
  locationHint: string | null;
  feeNote: string | null;
  contact: string | null;
  contactVisibility: string;
  details: string | null;
  visibility: string;
  groupingEnabled: boolean;
  scoringEnabled: boolean;
  status: string;
  version: number;
  isOrganizer: boolean;
  changeVersion: number;
  cancelReason: string | null;
};

type Registration = {
  status: string;
  queueNo: number;
  waitlistPosition: number | null;
  hasPendingChange: boolean;
};

type Member = { nickname: string; status: string; queueNo: number; initial?: string };
type ActivityChange = { id: string; version: number; changedFields: string[]; createdAt: string };

const CHANGE_LABELS: Record<string, string> = {
  startAt: "开始时间",
  endAt: "结束时间",
  registrationDeadline: "报名截止时间",
  venueId: "场馆",
  locationHint: "场号或位置",
  capacity: "人数上限",
  status: "活动状态",
};

function requestKey(action: string, activityId: string): string {
  return `${action}-${activityId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

Page({
  activityId: "",

  data: {
    loading: true,
    activity: null as
      | (Activity & {
          startText: string;
          endText: string;
          deadlineText: string;
          levelText: string;
          registrationAction: string;
          registrationText: string;
          registrationClosed: boolean;
          registrationActionAvailable: boolean;
          organizerInitial: string;
        })
      | null,
    currentRegistration: null as Registration | null,
    roster: null as { confirmed: Member[]; waitlist: Member[] } | null,
    changes: [] as Array<ActivityChange & { summary: string; timeText: string }>,
    changeConfirmation: null as { acknowledged: number; pending: number } | null,
    submitting: false,
    message: "",
  },

  onLoad(options: Record<string, string | undefined>) {
    this.activityId = options.id ?? "";
    wx.showShareMenu({ menus: ["shareAppMessage", "shareTimeline"] });
  },

  async onShow() {
    if (this.activityId) await this.loadActivity();
  },

  async loadActivity() {
    try {
      this.setData({ loading: true, message: "" });
      const result = await callCloud<{
        activity: Activity;
        currentRegistration: Registration | null;
        roster: { confirmed: Member[]; waitlist: Member[] } | null;
        changes: ActivityChange[];
        changeConfirmation: { acknowledged: number; pending: number } | null;
      }>("activity.get", { id: this.activityId });
      const currentStatus = result.currentRegistration?.status;
      const registrationClosed =
        result.activity.status !== "OPEN" ||
        new Date(result.activity.registrationDeadline).getTime() <= Date.now();
      const isActive = currentStatus === "CONFIRMED" || currentStatus === "WAITLISTED";
      const activity = {
        ...result.activity,
        startText: formatChinaDateTime(result.activity.startAt),
        endText: formatChinaDateTime(result.activity.endAt),
        deadlineText: formatChinaDateTime(result.activity.registrationDeadline),
        levelText: levelLabel(result.activity.level),
        registrationClosed,
        registrationActionAvailable:
          result.activity.status === "OPEN" && (isActive || !registrationClosed),
        registrationAction: isActive ? "leave" : "join",
        registrationText:
          currentStatus === "CONFIRMED"
            ? "退出球局"
            : currentStatus === "WAITLISTED"
              ? "退出候补"
              : result.activity.registeredCount >= result.activity.capacity
                ? "加入候补"
                : "报名参加",
        organizerInitial: result.activity.organizer.nickname.slice(0, 1),
      };
      this.setData({
        loading: false,
        activity,
        currentRegistration: result.currentRegistration,
        roster: result.roster
          ? {
              confirmed: result.roster.confirmed.map((member) => ({
                ...member,
                initial: member.nickname.slice(0, 1),
              })),
              waitlist: result.roster.waitlist.map((member) => ({
                ...member,
                initial: member.nickname.slice(0, 1),
              })),
            }
          : null,
        changes: result.changes.map((change) => ({
          ...change,
          summary: change.changedFields.map((field) => CHANGE_LABELS[field] ?? field).join("、"),
          timeText: formatChinaDateTime(change.createdAt),
        })),
        changeConfirmation: result.changeConfirmation,
      });
      wx.setNavigationBarTitle({ title: activity.title });
    } catch (error) {
      this.setData({
        loading: false,
        message: error instanceof Error ? error.message : "球局加载失败",
      });
    }
  },

  async acknowledgeChange() {
    await this.runAction("activity.ackChange", { id: this.activityId }, "已确认变更");
  },

  async cancelActivity() {
    const prompt = await wx.showModal({
      title: "取消球局",
      content: "请填写取消原因",
      editable: true,
      placeholderText: "原因会展示给成员",
    });
    if (!prompt.confirm || !prompt.content?.trim()) return;
    await this.runAction(
      "activity.cancel",
      { id: this.activityId, reason: prompt.content },
      "球局已取消",
    );
  },

  async startActivity() {
    await this.runAction("activity.start", { id: this.activityId }, "球局已开始");
  },

  async finishActivity() {
    const confirmation = await wx.showModal({
      title: "结束球局？",
      content: "未标记到场的正式成员将记录为未到场。",
    });
    if (!confirmation.confirm) return;
    await this.runAction("activity.finish", { id: this.activityId }, "球局已结束");
  },

  async runAction(action: string, payload: unknown, success: string) {
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    try {
      await callCloud(action, payload);
      wx.showToast({ title: success, icon: "success" });
      await this.loadActivity();
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "操作失败", icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  },

  async submitRegistration() {
    const activity = this.data.activity;
    if (!activity || this.data.submitting) return;
    const leaving = activity.registrationAction === "leave";
    if (leaving && this.data.currentRegistration?.status === "CONFIRMED") {
      const confirmation = await wx.showModal({
        title: "确认退出球局？",
        content: "若仍在报名截止前，第一位候补将自动递补。",
        confirmText: "确认退出",
      });
      if (!confirmation.confirm) return;
    }

    this.setData({ submitting: true });
    try {
      const action = leaving ? "registration.leave" : "registration.join";
      await callCloud(action, {
        activityId: activity.id,
        idempotencyKey: requestKey(leaving ? "leave" : "join", activity.id),
      });
      wx.showToast({ title: leaving ? "已退出" : "报名状态已更新", icon: "success" });
      await this.loadActivity();
    } catch (error) {
      const message = error instanceof Error ? error.message : "操作失败，请重试";
      if (message.includes("设置昵称")) {
        const result = await wx.showModal({ title: "请先完善资料", content: message });
        if (result.confirm) wx.navigateTo({ url: "/pages/profile/edit" });
      } else {
        wx.showToast({ title: message, icon: "none" });
      }
    } finally {
      this.setData({ submitting: false });
    }
  },

  onShareAppMessage() {
    const activity = this.data.activity;
    return {
      title: activity ? `${activity.title}｜${activity.venue.name}` : "羽来球局",
      path: `/pages/activities/detail?id=${this.activityId}`,
      imageUrl: "/assets/hero-badminton-bg.jpg",
    };
  },

  onShareTimeline() {
    const activity = this.data.activity;
    return {
      title: activity ? `${activity.title}｜${activity.venue.name}` : "羽来球局",
      query: `id=${this.activityId}`,
      imageUrl: "/assets/hero-badminton-bg.jpg",
    };
  },
});
