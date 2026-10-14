import {
  configuredSubscriptionTemplates,
  type SubscriptionTemplateKey,
} from "../../config/subscription";
import { callCloud } from "../../services/cloud-api";
import { formatChinaDateTime } from "../../utils/date";
import { appearanceView, applyNativeAppearance, loadAppearanceState } from "../../utils/appearance";

type Notification = {
  id: string;
  activityId: string | null;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
};

type SubscriptionPreference = {
  templateKey: SubscriptionTemplateKey;
  templateId: string;
  status: "accept" | "reject" | "ban" | "consumed";
  updatedAt?: string | null;
};

function subscriptionStatus(
  configuredCount: number,
  preferences: SubscriptionPreference[],
): { state: string; title: string; copy: string } {
  if (configuredCount === 0) {
    return {
      state: "UNCONFIGURED",
      title: "微信提醒待配置",
      copy: "站内消息正常可用；管理员配置正式模板后即可开启微信提醒。",
    };
  }
  const accepted = preferences.filter((item) => item.status === "accept").length;
  if (accepted > 0) {
    return {
      state: "ENABLED",
      title: "已开启微信提醒",
      copy: "微信会按你本次允许的模板发送一次提醒，之后可再次授权。",
    };
  }
  return {
    state: "AVAILABLE",
    title: "开启微信提醒",
    copy: "可接收球局变更、取消和候补递补提醒，拒绝不会影响报名。",
  };
}

Page({
  listRequestVersion: 0,
  isVisible: false,
  data: {
    loading: true,
    loadingMore: false,
    subscribing: false,
    message: "",
    nextOffset: null as number | null,
    notifications: [] as Array<Notification & { timeText: string }>,
    subscriptionState: "UNCONFIGURED",
    subscriptionTitle: "微信提醒待配置",
    subscriptionCopy: "站内消息正常可用。",
    configuredTemplateCount: 0,
    ...appearanceView(),
  },

  async onShow() {
    this.isVisible = true;
    const appearance = loadAppearanceState();
    applyNativeAppearance(appearance.preferences);
    this.setData(appearanceView(appearance.preferences));
    await Promise.allSettled([this.loadNotifications(true), this.loadSubscriptionState()]);
  },
  onHide() {
    this.isVisible = false;
    this.listRequestVersion += 1;
  },
  onUnload() {
    this.isVisible = false;
    this.listRequestVersion += 1;
  },

  async onReachBottom() {
    if (this.data.nextOffset !== null && !this.data.loadingMore)
      await this.loadNotifications(false);
  },

  async loadNotifications(reset: boolean) {
    const offset = reset ? 0 : this.data.nextOffset;
    if (offset === null) return;
    const requestVersion = reset ? ++this.listRequestVersion : this.listRequestVersion;
    this.setData(
      reset
        ? { loading: true, loadingMore: false, message: "" }
        : { loadingMore: true, message: "" },
    );
    try {
      const result = await callCloud<{ notifications: Notification[]; nextOffset: number | null }>(
        "notification.list",
        { offset, limit: 20 },
      );
      if (!this.isVisible || requestVersion !== this.listRequestVersion) return;
      const page = result.notifications.map((item) => ({
        ...item,
        timeText: formatChinaDateTime(item.createdAt),
      }));
      const existing = reset ? [] : this.data.notifications;
      const seen = new Set(existing.map((item) => item.id));
      const additions = page.filter((item) => !seen.has(item.id));
      const update: Record<string, unknown> = {
        loading: false,
        loadingMore: false,
        nextOffset: result.nextOffset,
      };
      if (reset) update.notifications = additions;
      else
        additions.forEach((item, index) => {
          update[`notifications[${existing.length + index}]`] = item;
        });
      this.setData(update);
    } catch {
      if (!this.isVisible || requestVersion !== this.listRequestVersion) return;
      this.setData({
        loading: false,
        loadingMore: false,
        message: "消息加载失败，请检查网络后重试",
      });
    }
  },

  async loadSubscriptionState() {
    const templates = configuredSubscriptionTemplates();
    this.setData({ configuredTemplateCount: templates.length });
    if (templates.length === 0) {
      const status = subscriptionStatus(0, []);
      this.setData({
        subscriptionState: status.state,
        subscriptionTitle: status.title,
        subscriptionCopy: status.copy,
      });
      return;
    }
    try {
      const result = await callCloud<{ preferences: SubscriptionPreference[] }>(
        "notification.subscription.list",
      );
      const status = subscriptionStatus(templates.length, result.preferences);
      this.setData({
        subscriptionState: status.state,
        subscriptionTitle: status.title,
        subscriptionCopy: status.copy,
      });
    } catch {
      this.setData({
        subscriptionState: "AVAILABLE",
        subscriptionTitle: "微信提醒状态暂不可用",
        subscriptionCopy: "稍后可重新进入查看；站内消息不受影响。",
      });
    }
  },

  async retryNotifications() {
    await this.loadNotifications(true);
  },

  async requestSubscription() {
    const templates = configuredSubscriptionTemplates();
    if (templates.length === 0) {
      await wx.showModal({
        title: "微信提醒暂未开放",
        content: "订阅消息模板尚未在微信公众平台配置。站内消息仍会正常记录重要变更。",
        showCancel: false,
      });
      return;
    }
    if (this.data.subscribing) return;
    this.setData({ subscribing: true });
    try {
      const result = await wx.requestSubscribeMessage({
        tmplIds: templates.map((template) => template.id),
      });
      const preferences = templates.map((template) => {
        const value = Reflect.get(result, template.id);
        const status: SubscriptionPreference["status"] =
          value === "accept" ? "accept" : value === "ban" ? "ban" : "reject";
        return { templateKey: template.key, templateId: template.id, status };
      });
      await callCloud("notification.subscription.save", { preferences });
      const status = subscriptionStatus(templates.length, preferences);
      this.setData({
        subscriptionState: status.state,
        subscriptionTitle: status.title,
        subscriptionCopy: status.copy,
      });
      wx.showToast({
        title: preferences.some((item) => item.status === "accept")
          ? "提醒已开启"
          : "授权结果已记录",
        icon: "none",
      });
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : "暂时无法申请提醒",
        icon: "none",
      });
    } finally {
      this.setData({ subscribing: false });
    }
  },

  async openNotification(event: WechatMiniprogram.TouchEvent) {
    const { id, activityId } = event.currentTarget.dataset as { id: string; activityId?: string };
    this.setData({
      notifications: this.data.notifications.map((item) =>
        item.id === id ? { ...item, isRead: true } : item,
      ),
    });
    if (activityId) wx.navigateTo({ url: `/pages/activities/detail?id=${activityId}` });
    void callCloud("notification.markRead", { id }).catch(() => {
      // The next onShow reloads the authoritative read state.
    });
  },
});
