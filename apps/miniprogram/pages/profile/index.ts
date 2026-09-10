import { callCloud } from "../../services/cloud-api";
import { levelLabel } from "../../utils/labels";

type Profile = {
  nickname: string | null;
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
    schoolName: "学校未填写",
    levelText: "不清楚",
    upcomingCount: 0,
    organizingCount: 0,
    gameCount: 0,
    isAdmin: false,
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
});
