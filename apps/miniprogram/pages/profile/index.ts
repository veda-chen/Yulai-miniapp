import { callCloud } from "../../services/cloud-api";
import { levelLabel } from "../../utils/labels";

type Profile = {
  nickname: string | null;
  avatarFileId: string | null;
  school: { name: string } | null;
  level: string;
  role: string;
};

type Activity = { isOrganizer: boolean; currentRegistrationStatus: string | null };

Page({
  data: {
    loading: true,
    nickname: "羽来球友",
    initial: "羽",
    avatarFileId: "",
    schoolName: "学校未填写",
    levelText: "不清楚",
    upcomingCount: 0,
    organizingCount: 0,
    gameCount: 0,
    isAdmin: false,
    deleting: false,
  },

  async onShow() {
    try {
      await callCloud("auth.session");
      const [profileResult, activityResult, scoreResult] = await Promise.all([
        callCloud<{ user: Profile }>("user.getMe"),
        callCloud<{ activities: Activity[] }>("activity.list"),
        callCloud<{ stats: { games: number } }>("score.stats"),
      ]);
      const profile = profileResult.user;
      const nickname = profile.nickname ?? "羽来球友";
      this.setData({
        loading: false,
        nickname,
        initial: nickname.slice(0, 1),
        avatarFileId: profile.avatarFileId ?? "",
        schoolName: profile.school?.name ?? "学校未填写",
        levelText: levelLabel(profile.level),
        upcomingCount: activityResult.activities.filter(
          (item) => item.currentRegistrationStatus === "CONFIRMED",
        ).length,
        organizingCount: activityResult.activities.filter((item) => item.isOrganizer).length,
        gameCount: scoreResult.stats.games,
        isAdmin: profile.role === "ADMIN",
      });
    } catch {
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
