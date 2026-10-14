import { callCloud } from "../../services/cloud-api";
import { levelLabel } from "../../utils/labels";
import {
  appearanceView,
  applyNativeAppearance,
  clearAppearanceState,
  loadAppearanceState,
} from "../../utils/appearance";
import { clearAllToolDrafts } from "../../utils/tool-storage";

type Profile = {
  nickname: string | null;
  avatarFileId: string | null;
  school: { name: string } | null;
  level: string;
  role: string;
};

Page({
  requestVersion: 0,
  isVisible: false,
  data: {
    loading: true,
    nickname: "羽来球友",
    initial: "羽",
    avatarFileId: "",
    schoolName: "学校未填写",
    levelText: "不清楚",
    upcomingCount: "—" as number | string,
    organizingCount: "—" as number | string,
    gameCount: "—" as number | string,
    profileError: "",
    summaryError: "",
    scoreError: "",
    isAdmin: false,
    deleting: false,
    ...appearanceView(),
  },

  async onShow() {
    this.isVisible = true;
    const appearance = loadAppearanceState();
    applyNativeAppearance(appearance.preferences);
    (this.getTabBar?.() as { refresh?: () => void } | null)?.refresh?.();
    this.setData(appearanceView(appearance.preferences));
    await this.load();
  },

  onHide() {
    this.isVisible = false;
    this.requestVersion += 1;
  },

  onUnload() {
    this.isVisible = false;
    this.requestVersion += 1;
  },

  async load() {
    const requestVersion = ++this.requestVersion;
    this.setData({ loading: true, profileError: "", summaryError: "", scoreError: "" });
    try {
      await callCloud("auth.session");
      const [profileResult, summaryResult, scoreResult] = await Promise.allSettled([
        callCloud<{ user: Profile }>("user.getMe"),
        callCloud<{ upcomingCount: number; organizingCount: number }>("activity.mySummary"),
        callCloud<{ stats: { games: number } }>("score.stats"),
      ]);
      if (!this.isVisible || requestVersion !== this.requestVersion) return;
      if (profileResult.status === "fulfilled") {
        const profile = profileResult.value.user;
        const nickname = profile.nickname ?? "羽来球友";
        this.setData({
          nickname,
          initial: nickname.slice(0, 1),
          avatarFileId: profile.avatarFileId ?? "",
          schoolName: profile.school?.name ?? "学校未填写",
          levelText: levelLabel(profile.level),
          isAdmin: profile.role === "ADMIN",
        });
      } else this.setData({ profileError: "资料加载失败" });
      if (summaryResult.status === "fulfilled") this.setData(summaryResult.value);
      else this.setData({ summaryError: "球局统计暂不可用" });
      if (scoreResult.status === "fulfilled")
        this.setData({ gameCount: scoreResult.value.stats.games });
      else this.setData({ scoreError: "战绩暂不可用" });
    } catch {
      if (!this.isVisible || requestVersion !== this.requestVersion) return;
      this.setData({ profileError: "资料加载失败，请重试" });
    } finally {
      if (this.isVisible && requestVersion === this.requestVersion)
        this.setData({ loading: false });
    }
  },

  async deleteAccount() {
    if (this.data.deleting) return;
    const first = await wx.showModal({
      title: "注销羽来账号",
      content: "注销后个人资料会被清除，历史记录中的昵称会匿名化。该操作不能撤销。",
      confirmText: "继续",
      confirmColor: "#d93025",
    });
    if (!first.confirm) return;
    const second = await wx.showModal({
      title: "再次确认",
      content: "请先退出已报名或候补的球局，并取消或结束正在组织的球局。",
      confirmText: "确认注销",
      confirmColor: "#d93025",
    });
    if (!second.confirm) return;
    this.setData({ deleting: true });
    try {
      await callCloud("user.deleteMe", { confirmation: "DELETE_MY_ACCOUNT" });
      clearAppearanceState();
      clearAllToolDrafts();
      try {
        wx.removeStorageSync("yulai:activity-form:v1");
      } catch {}
      await wx.showModal({ title: "账号已注销", content: "个人资料已清除。", showCancel: false });
      wx.reLaunch({ url: "/pages/activities/list" });
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : "注销失败，请稍后重试",
        icon: "none",
      });
      this.setData({ deleting: false });
    }
  },
});
