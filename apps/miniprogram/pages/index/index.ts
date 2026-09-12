import { callCloud } from "../../services/cloud-api";

type SessionData = {
  user: {
    id: string;
    isNew: boolean;
  };
};

type ProfileData = {
  user: {
    nickname: string | null;
    needsProfile: boolean;
  };
};

type Activity = {
  id: string;
  title: string;
  startAt: string;
  capacity: number;
  registeredCount: number;
  waitlistCount: number;
  currentRegistrationStatus: string | null;
  level: string;
  venue: { name: string };
};

const LEVEL_NAMES: Record<string, string> = {
  ANY: "不限水平",
  CASUAL: "休闲局",
  BEGINNER: "新手局",
  IMPROVING: "进阶局",
  COMPETITIVE: "对抗局",
};

function dateParts(value: string) {
  const date = new Date(value);
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return {
    shortTime: `${weekdays[date.getDay()]} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
    shortDate: `${date.getMonth() + 1}月${date.getDate()}日`,
  };
}

Page({
  data: {
    greeting: "你好",
    userName: "球友",
    dateText: "",
    activities: [] as Array<
      Activity & {
        shortTime: string;
        shortDate: string;
        levelText: string;
        registrationText: string;
      }
    >,
  },

  onLoad() {
    const now = new Date();
    const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
    const hour = now.getHours();
    this.setData({
      greeting: hour < 11 ? "早安" : hour < 18 ? "下午好" : "晚上好",
      dateText: `${now.getMonth() + 1}月${now.getDate()}日 ${weekdays[now.getDay()]}`,
    });
  },

  async onShow() {
    try {
      await callCloud<SessionData>("auth.session");
      const [profile, activityData] = await Promise.all([
        callCloud<ProfileData>("user.getMe"),
        callCloud<{ activities: Activity[] }>("activity.list"),
      ]);
      const activities = activityData.activities
        .filter(
          (item) =>
            item.currentRegistrationStatus === "CONFIRMED" ||
            item.currentRegistrationStatus === "WAITLISTED",
        )
        .slice(0, 4)
        .map((item) => ({
          ...item,
          ...dateParts(item.startAt),
          levelText: LEVEL_NAMES[item.level] ?? "不限水平",
          registrationText: item.currentRegistrationStatus === "WAITLISTED" ? "候补中" : "已报名",
        }));
      this.setData({
        userName: profile.user.nickname ?? "球友",
        activities,
      });
    } catch {}
  },
});
