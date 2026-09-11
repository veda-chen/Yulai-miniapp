import { callCloud } from "../../services/cloud-api";

type ValueEvent = WechatMiniprogram.CustomEvent<{ value: string }>;
type AvatarEvent = WechatMiniprogram.CustomEvent<{ avatarUrl: string }>;

type School = { id: string; name: string };
type ProfileResponse = {
  user: {
    id: string;
    nickname: string | null;
    avatarFileId: string | null;
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
    uploadingAvatar: false,
    userId: "",
    nickname: "",
    initial: "羽",
    avatarFileId: null as string | null,
    avatarUrl: "",
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
        userId: profile.user.id,
        nickname: profile.user.nickname ?? "",
        initial: (profile.user.nickname ?? "羽").slice(0, 1),
        avatarFileId: profile.user.avatarFileId,
        avatarUrl: profile.user.avatarFileId ?? "",
        schools,
        schoolIndex,
        levelIndex,
      });
    } catch {
      this.setData({ loading: false, message: "资料加载失败，请稍后重试" });
    }
  },

  onNicknameInput(event: ValueEvent) {
    this.setData({
      nickname: event.detail.value,
      initial: event.detail.value.trim().slice(0, 1) || "羽",
    });
  },

  async onChooseAvatar(event: AvatarEvent) {
    if (this.data.uploadingAvatar || !this.data.userId) return;
    const temporaryUrl = event.detail.avatarUrl;
    if (!temporaryUrl) return;
    const extension = /\.(png|jpe?g)$/i.exec(temporaryUrl)?.[0].toLowerCase() ?? ".jpg";
    const cloudPath = `avatars/${this.data.userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}${extension}`;
    let uploadedFileId: string | null = null;
    this.setData({ uploadingAvatar: true, avatarUrl: temporaryUrl, message: "正在上传头像" });
    try {
      const upload = await wx.cloud.uploadFile({ cloudPath, filePath: temporaryUrl });
      uploadedFileId = upload.fileID;
      await callCloud("user.updateAvatar", { avatarFileId: upload.fileID });
      this.setData({
        uploadingAvatar: false,
        avatarFileId: upload.fileID,
        avatarUrl: upload.fileID,
        message: "头像已更新",
      });
    } catch (error) {
      if (uploadedFileId) {
        try {
          await wx.cloud.deleteFile({ fileList: [uploadedFileId] });
        } catch {
          // The server validates ownership, and orphan cleanup can be retried operationally.
        }
      }
      this.setData({
        uploadingAvatar: false,
        avatarUrl: this.data.avatarFileId ?? "",
        message: error instanceof Error ? error.message : "头像上传失败，请稍后重试",
      });
    }
  },

  async removeAvatar() {
    if (this.data.uploadingAvatar || !this.data.avatarFileId) return;
    this.setData({ uploadingAvatar: true, message: "正在移除头像" });
    try {
      await callCloud("user.updateAvatar", { avatarFileId: null });
      this.setData({
        uploadingAvatar: false,
        avatarFileId: null,
        avatarUrl: "",
        message: "头像已移除",
      });
    } catch (error) {
      this.setData({
        uploadingAvatar: false,
        message: error instanceof Error ? error.message : "头像移除失败，请稍后重试",
      });
    }
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
