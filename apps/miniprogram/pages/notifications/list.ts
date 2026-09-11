import {
  configuredSubscriptionTemplates,
  type SubscriptionTemplateKey,
} from "../../config/subscription";
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

type SubscriptionPreference = {
  templateKey: SubscriptionTemplateKey;
  templateId: string;
  status: "accept" | "reject" | "ban";
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
  data: {
    loading: true,
    subscribing: false,
    notifications: [] as Array<Notification & { timeText: string }>,
    subscriptionState: "UNCONFIGURED",
    subscriptionTitle: "微信提醒待配置",
    subscriptionCopy: "站内消息正常可用。",
    configuredTemplateCount: 0,
  },

  async onShow() {
    const templates = configuredSubscriptionTemplates();
    try {
      const notificationPromise = callCloud<{ notifications: Notification[] }>("notification.list");
      const preferencePromise = templates.length
        ? callCloud<{ preferences: SubscriptionPreference[] }>("notification.subscription.list")
        : Promise.resolve({ preferences: [] as SubscriptionPreference[] });
      const [notificationResult, preferenceResult] = await Promise.all([
        notificationPromise,
        preferencePromise,
      ]);
      const status = subscriptionStatus(templates.length, preferenceResult.preferences);
      this.setData({
        loading: false,
        notifications: notificationResult.notifications.map((item) => ({
          ...item,
          timeText: formatChinaDateTime(item.createdAt),
        })),
        configuredTemplateCount: templates.length,
        subscriptionState: status.state,
        subscriptionTitle: status.title,
        subscriptionCopy: status.copy,
      });
    } catch {
      const status = subscriptionStatus(templates.length, []);
      this.setData({
        loading: false,
        notifications: [],
        configuredTemplateCount: templates.length,
        subscriptionState: status.state,
        subscriptionTitle: status.title,
        subscriptionCopy: status.copy,
      });
    }
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
    await callCloud("notification.markRead", { id });
    if (activityId) wx.navigateTo({ url: `/pages/activities/detail?id=${activityId}` });
    else await this.onShow();
  },
});
