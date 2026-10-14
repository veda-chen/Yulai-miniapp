import { callCloud, CloudApiError } from "../../services/cloud-api";
import { activityStatusView } from "../../utils/activity-experience";
import { formatChinaDateTime } from "../../utils/date";
import { appearanceView, applyNativeAppearance, loadAppearanceState } from "../../utils/appearance";
import { levelLabel } from "../../utils/labels";

type Activity = {
  id: string;
  title: string;
  venue: { id: string; name: string };
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
  venueAvailable?: boolean;
};

type Registration = {
  status: string;
  queueNo: number;
  waitlistPosition: number | null;
  hasPendingChange: boolean;
};

type Member = {
  nickname: string;
  status: string;
  queueNo: number;
  initial?: string;
  statusText?: string;
};
type ActivityChange = { id: string; version: number; changedFields: string[]; createdAt: string };

type ActivityView = Activity & {
  startText: string;
  endText: string;
  deadlineText: string;
  levelText: string;
  registrationAction: string;
  registrationText: string;
  registrationClosed: boolean;
  registrationActionAvailable: boolean;
  organizerInitial: string;
  capacityHint: string;
};

const CHANGE_LABELS: Record<string, string> = {
  startAt: "开始时间",
  endAt: "结束时间",
  registrationDeadline: "报名截止时间",
  venueId: "场馆",
  locationHint: "场号或位置",
  capacity: "人数上限",
  status: "活动状态",
};

const MEMBER_STATUS_LABELS: Record<string, string> = {
  CONFIRMED: "已报名",
  ATTENDED: "已到场",
  NO_SHOW: "未到场",
};

function requestKey(action: string, activityId: string): string {
  return `${action}-${activityId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function activityView(activity: Activity, currentStatus: string | null): ActivityView {
  const status = activityStatusView(activity, currentStatus);
  return {
    ...activity,
    ...status,
    startText: formatChinaDateTime(activity.startAt),
    endText: formatChinaDateTime(activity.endAt),
    deadlineText: formatChinaDateTime(activity.registrationDeadline),
    levelText: levelLabel(activity.level),
    registrationAction: ["CONFIRMED", "WAITLISTED"].includes(currentStatus ?? "")
      ? "leave"
      : "join",
    registrationText:
      currentStatus === "CONFIRMED"
        ? "退出球局"
        : currentStatus === "WAITLISTED"
          ? "退出候补"
          : activity.registeredCount >= activity.capacity
            ? "加入候补"
            : "报名参加",
    organizerInitial: activity.organizer.nickname.slice(0, 1),
  };
}

function loadFailureMessage(error: unknown): string {
  if (error instanceof CloudApiError) {
    if (error.code === "NOT_FOUND") return "这个球局不存在或已被删除";
    if (["FORBIDDEN", "UNAUTHORIZED"].includes(error.code)) return "你暂时没有权限查看这个球局";
    if (error.code === "INVALID_ARGUMENT") return "球局链接无效，请返回首页重新选择";
  }
  return error instanceof Error ? error.message : "球局加载失败，请稍后重试";
}

Page({
  activityId: "",
  deadlineTimer: null as number | null,
  createdSuccessPending: false,
  requestVersion: 0,
  isVisible: false,

  data: {
    loading: true,
    activity: null as ActivityView | null,
    currentRegistration: null as Registration | null,
    roster: null as { confirmed: Member[]; waitlist: Member[] } | null,
    changes: [] as Array<ActivityChange & { summary: string; timeText: string }>,
    changeConfirmation: null as { acknowledged: number; pending: number } | null,
    submitting: false,
    activeAction: "",
    actionMessage: "",
    actionTone: "info",
    refreshFailed: false,
    message: "",
    ...appearanceView(),
  },

  onLoad(options: Record<string, string | undefined>) {
    this.activityId = options.id ?? "";
    this.createdSuccessPending = options.created === "1";
    if (!this.activityId) {
      this.setData({ loading: false, message: "球局链接无效，请返回首页重新选择" });
    }
    wx.showShareMenu({ menus: ["shareAppMessage", "shareTimeline"] });
  },

  async onShow() {
    this.isVisible = true;
    const appearance = loadAppearanceState();
    applyNativeAppearance(appearance.preferences);
    this.setData(appearanceView(appearance.preferences));
    if (this.data.activity) {
      this.setData({
        activity: activityView(this.data.activity, this.data.currentRegistration?.status ?? null),
      });
    }
    if (this.activityId) await this.loadActivity({ preserve: this.data.activity !== null });
  },

  onHide() {
    this.isVisible = false;
    this.requestVersion += 1;
    this.clearDeadlineTimer();
  },

  onUnload() {
    this.isVisible = false;
    this.requestVersion += 1;
    this.clearDeadlineTimer();
  },

  async retryLoad() {
    if (!this.activityId) return;
    await this.loadActivity({ preserve: this.data.activity !== null });
  },

  goHome() {
    wx.switchTab({ url: "/pages/index/index" });
  },

  clearDeadlineTimer() {
    if (this.deadlineTimer !== null) clearTimeout(this.deadlineTimer);
    this.deadlineTimer = null;
  },

  scheduleDeadlineRefresh() {
    this.clearDeadlineTimer();
    const activity = this.data.activity;
    if (activity?.status !== "OPEN" || activity.registrationClosed) return;
    const remaining = Date.parse(activity.registrationDeadline) - Date.now();
    const delay = Math.min(Math.max(remaining + 100, 100), 60 * 60 * 1000);
    this.deadlineTimer = setTimeout(() => {
      this.deadlineTimer = null;
      const current = this.data.activity;
      if (!current) return;
      this.setData(
        { activity: activityView(current, this.data.currentRegistration?.status ?? null) },
        () => this.scheduleDeadlineRefresh(),
      );
    }, delay) as unknown as number;
  },

  async loadActivity(options: { preserve?: boolean; failureMessage?: string } = {}) {
    const requestVersion = ++this.requestVersion;
    try {
      if (!options.preserve) this.setData({ loading: true, message: "", refreshFailed: false });
      const result = await callCloud<{
        activity: Activity;
        currentRegistration: Registration | null;
        roster: { confirmed: Member[]; waitlist: Member[] } | null;
        changes: ActivityChange[];
        changeConfirmation: { acknowledged: number; pending: number } | null;
      }>("activity.get", { id: this.activityId });
      if (!this.isVisible || requestVersion !== this.requestVersion) return false;
      const activity = activityView(result.activity, result.currentRegistration?.status ?? null);
      this.setData({
        loading: false,
        activity,
        currentRegistration: result.currentRegistration,
        roster: result.roster
          ? {
              confirmed: result.roster.confirmed.map((member) => ({
                ...member,
                initial: member.nickname.slice(0, 1),
                statusText: MEMBER_STATUS_LABELS[member.status] ?? "参与球友",
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
        refreshFailed: false,
        ...(this.createdSuccessPending
          ? { actionMessage: "球局发布成功，可以分享给球友了", actionTone: "success" }
          : {}),
      });
      this.createdSuccessPending = false;
      wx.setNavigationBarTitle({ title: activity.title });
      this.scheduleDeadlineRefresh();
      return true;
    } catch (error) {
      if (!this.isVisible || requestVersion !== this.requestVersion) return false;
      if (options.preserve && this.data.activity) {
        this.setData({
          refreshFailed: true,
          actionMessage: options.failureMessage ?? "详情更新失败，已保留当前内容",
          actionTone: "warning",
        });
        return false;
      }
      this.setData({
        loading: false,
        message: loadFailureMessage(error),
      });
      return false;
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
    const confirmation = await wx.showModal({
      title: "开始球局？",
      content: "开始后将结束报名，并开放已启用的现场功能。",
      confirmText: "开始球局",
    });
    if (!confirmation.confirm) return;
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
    this.setData({
      submitting: true,
      activeAction: action,
      actionMessage: "",
      refreshFailed: false,
    });
    try {
      await callCloud(action, payload);
      const status =
        action === "activity.start"
          ? "IN_PROGRESS"
          : action === "activity.finish"
            ? "ENDED"
            : action === "activity.cancel"
              ? "CANCELLED"
              : this.data.activity?.status;
      if (this.data.activity && status) {
        this.setData({
          activity: activityView(
            { ...this.data.activity, status },
            this.data.currentRegistration?.status ?? null,
          ),
        });
      }
      this.setData({ actionMessage: success, actionTone: "success" });
      await this.loadActivity({ preserve: true, failureMessage: "操作已成功，详情更新失败" });
    } catch (error) {
      this.setData({
        actionMessage: error instanceof Error ? error.message : "操作失败，请重试",
        actionTone: "error",
      });
    } finally {
      this.setData({ submitting: false, activeAction: "" });
    }
  },

  async submitRegistration() {
    const activity = this.data.activity;
    if (!activity || this.data.submitting) return;
    const leaving = activity.registrationAction === "leave";
    const previousStatus = this.data.currentRegistration?.status ?? null;
    if (leaving && this.data.currentRegistration?.status === "CONFIRMED") {
      const confirmation = await wx.showModal({
        title: "确认退出球局？",
        content: "若仍在报名截止前，第一位候补将自动递补。",
        confirmText: "确认退出",
      });
      if (!confirmation.confirm) return;
    }

    this.setData({ submitting: true, activeAction: "registration", actionMessage: "" });
    try {
      const action = leaving ? "registration.leave" : "registration.join";
      const result = await callCloud<{
        registration: {
          status: string;
          registeredCount: number;
          waitlistCount: number;
          waitlistPosition: number | null;
        };
      }>(action, {
        activityId: activity.id,
        idempotencyKey: requestKey(leaving ? "leave" : "join", activity.id),
      });
      const registration = result.registration;
      const nextRegistration = leaving
        ? null
        : {
            status: registration.status,
            queueNo: this.data.currentRegistration?.queueNo ?? 0,
            waitlistPosition: registration.waitlistPosition,
            hasPendingChange: false,
          };
      this.setData({
        activity: activityView(
          {
            ...activity,
            registeredCount: registration.registeredCount,
            waitlistCount: registration.waitlistCount,
          },
          nextRegistration?.status ?? null,
        ),
        currentRegistration: nextRegistration,
      });
      const successText = leaving
        ? previousStatus === "WAITLISTED"
          ? "已退出候补"
          : "已退出球局"
        : registration.status === "WAITLISTED"
          ? `候补第 ${registration.waitlistPosition ?? "-"} 位`
          : "报名成功";
      this.setData({ actionMessage: successText, actionTone: "success" });
      await this.loadActivity({ preserve: true, failureMessage: "操作已成功，详情更新失败" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "操作失败，请重试";
      if (message.includes("设置昵称")) {
        const result = await wx.showModal({ title: "请先完善资料", content: message });
        if (result.confirm) wx.navigateTo({ url: "/pages/profile/edit" });
      } else {
        this.setData({ actionMessage: message, actionTone: "error" });
      }
    } finally {
      this.setData({ submitting: false, activeAction: "" });
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
