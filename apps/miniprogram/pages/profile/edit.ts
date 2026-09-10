import { callCloud } from "../../services/cloud-api";

type ValueEvent = WechatMiniprogram.CustomEvent<{ value: string }>;

type School = { id: string; name: string };
type ProfileResponse = {
  user: {
    nickname: string | null;
    school: School | null;
    level: string;
  };
};

const LEVELS = [
  { value: "UNKNOWN", label: "不清楚" },
  { value: "CASUAL", label: "休闲" },
  { value: "BEGINNER", label: "新手" },
  { value: "IMPROVING", label: "进阶" },
  { value: "COMPETITIVE", label: "对抗" },
];

Page({
  data: {
    loading: true,
    saving: false,
    nickname: "",
    schools: [{ id: "", name: "不填写" }] as School[],
    schoolIndex: 0,
    levels: LEVELS,
    levelIndex: 0,
    message: "学校为可选资料，可以随时清空",
  },

  async onLoad() {
    try {
      await callCloud("auth.session");
      const [profile, schoolData] = await Promise.all([
        callCloud<ProfileResponse>("user.getMe"),
        callCloud<{ schools: School[] }>("school.list"),
      ]);
      const schools = [{ id: "", name: "不填写" }, ...schoolData.schools];
      const schoolIndex = Math.max(
        0,
        schools.findIndex((school) => school.id === profile.user.school?.id),
      );
      const levelIndex = Math.max(
        0,
        LEVELS.findIndex((level) => level.value === profile.user.level),
      );
      this.setData({
        loading: false,
        nickname: profile.user.nickname ?? "",
        schools,
        schoolIndex,
        levelIndex,
      });
    } catch {
      this.setData({ loading: false, message: "资料加载失败，请稍后重试" });
    }
  },

  onNicknameInput(event: ValueEvent) {
    this.setData({ nickname: event.detail.value });
  },

  onSchoolChange(event: ValueEvent) {
    this.setData({ schoolIndex: Number(event.detail.value) });
  },

  onLevelChange(event: ValueEvent) {
    this.setData({ levelIndex: Number(event.detail.value) });
  },

  async onSave() {
    if (this.data.saving) return;
    const school = this.data.schools[this.data.schoolIndex];
    const level = this.data.levels[this.data.levelIndex];
    this.setData({ saving: true, message: "正在保存" });
    try {
      await callCloud("user.updateMe", {
        nickname: this.data.nickname,
        schoolId: school?.id || null,
        level: level?.value ?? "UNKNOWN",
      });
      this.setData({ saving: false, message: "资料已保存" });
    } catch (error) {
      this.setData({
        saving: false,
        message: error instanceof Error ? error.message : "保存失败，请稍后重试",
      });
    }
  },
});
