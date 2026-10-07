import { callCloud } from "../../services/cloud-api";
import { appearanceView, applyNativeAppearance, loadAppearanceState } from "../../utils/appearance";

type ValueEvent = WechatMiniprogram.CustomEvent<{ value: string }>;
type AvatarEvent = WechatMiniprogram.CustomEvent<{ avatarUrl: string }>;

type ProfileResponse = {
  user: {
    id: string;
    nickname: string | null;
    avatarFileId: string | null;
    school: { name: string } | null;
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
  initialForm: { nickname: "", schoolName: "", levelIndex: 0 },
  data: {
    loading: true,
    loadError: "",
    saving: false,
    uploadingAvatar: false,
    userId: "",
    nickname: "",
    initial: "羽",
    avatarFileId: null as string | null,
    avatarUrl: "",
    schoolName: "",
    levels: LEVELS,
    levelIndex: 0,
    nicknameError: "",
    dirty: false,
    message: "学校为可选资料，可以留空或随时清除",
    ...appearanceView(),
  },

  async onLoad() {
    const appearance = loadAppearanceState();
    applyNativeAppearance(appearance.preferences);
    this.setData(appearanceView(appearance.preferences));
    await this.loadProfile();
  },

  async retryLoad() {
    await this.loadProfile();
  },

  async loadProfile() {
    this.setData({ loading: true, loadError: "" });
    try {
      await callCloud("auth.session");
      const profile = await callCloud<ProfileResponse>("user.getMe");
      const levelIndex = Math.max(
        0,
        LEVELS.findIndex((level) => level.value === profile.user.level),
      );
      const nickname = profile.user.nickname ?? "";
      const schoolName = profile.user.school?.name ?? "";
      this.initialForm = { nickname, schoolName, levelIndex };
      this.setData({
        loading: false,
        userId: profile.user.id,
        nickname,
        initial: (profile.user.nickname ?? "羽").slice(0, 1),
        avatarFileId: profile.user.avatarFileId,
        avatarUrl: profile.user.avatarFileId ?? "",
        schoolName,
        levelIndex,
        dirty: false,
        nicknameError: "",
        message: "学校为可选资料，可以留空或随时清除",
      });
    } catch {
      this.setData({ loading: false, loadError: "资料加载失败，请检查网络后重试" });
    }
  },

  refreshDirty() {
    const dirty =
      this.data.nickname !== this.initialForm.nickname ||
      this.data.schoolName !== this.initialForm.schoolName ||
      this.data.levelIndex !== this.initialForm.levelIndex;
    this.setData({
      dirty,
      message: dirty ? "有未保存修改" : "资料已保存",
    });
  },

  onNicknameInput(event: ValueEvent) {
    this.setData(
      {
        nickname: event.detail.value,
        initial: event.detail.value.trim().slice(0, 1) || "羽",
        nicknameError: "",
        message: "有未保存修改",
      },
      () => this.refreshDirty(),
    );
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

  onSchoolInput(event: ValueEvent) {
    this.setData({ schoolName: event.detail.value, message: "有未保存修改" }, () =>
      this.refreshDirty(),
    );
  },

  onLevelChange(event: ValueEvent) {
    this.setData({ levelIndex: Number(event.detail.value), message: "有未保存修改" }, () =>
      this.refreshDirty(),
    );
  },

  async onSave() {
    if (this.data.saving || !this.data.dirty) return;
    const nickname = this.data.nickname.trim();
    if (!nickname) {
      this.setData({ nicknameError: "请填写昵称", message: "请检查标出的内容" });
      return;
    }
    const level = this.data.levels[this.data.levelIndex];
    this.setData({ saving: true, message: "正在保存" });
    try {
      await callCloud("user.updateMe", {
        nickname,
        schoolName: this.data.schoolName.trim() || null,
        level: level?.value ?? "UNKNOWN",
      });
      const schoolName = this.data.schoolName.trim();
      this.initialForm = { nickname, schoolName, levelIndex: this.data.levelIndex };
      this.setData({
        saving: false,
        nickname,
        schoolName,
        dirty: false,
        nicknameError: "",
        message: "资料已保存",
      });
    } catch (error) {
      this.setData({
        saving: false,
        message: error instanceof Error ? error.message : "保存失败，请稍后重试",
      });
    }
  },
});
