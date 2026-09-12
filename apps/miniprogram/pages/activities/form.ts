import { callCloud } from "../../services/cloud-api";
import { chinaFormToIso, getDefaultActivityTimes, toChinaFormValue } from "../../utils/date";

type ValueEvent = WechatMiniprogram.CustomEvent<{ value: string }>;
type SwitchEvent = WechatMiniprogram.CustomEvent<{ value: boolean }>;
type Venue = { id: string; name: string };
type ProfileData = { user: { nickname: string | null; needsProfile: boolean } };
type Activity = {
  id: string;
  title: string;
  venue: Venue;
  startAt: string;
  endAt: string;
  registrationDeadline: string;
  capacity: number;
  level: string;
  locationHint: string | null;
  feeNote: string | null;
  contact: string | null;
  contactVisibility: string;
  details: string | null;
  visibility: string;
  groupingEnabled: boolean;
  scoringEnabled: boolean;
  version: number;
};

const LEVELS = [
  { value: "ANY", label: "不限" },
  { value: "CASUAL", label: "休闲" },
  { value: "BEGINNER", label: "新手" },
  { value: "IMPROVING", label: "进阶" },
  { value: "COMPETITIVE", label: "对抗" },
];
const VISIBILITIES = [
  { value: "PUBLIC", label: "公开" },
  { value: "LINK_ONLY", label: "仅链接可见" },
];
const CONTACT_VISIBILITIES = [
  { value: "PARTICIPANTS", label: "仅正式参与者可见" },
  { value: "PUBLIC", label: "公开" },
  { value: "NONE", label: "不展示" },
];

Page({
  data: {
    loading: true,
    saving: false,
    profileRequired: false,
    activityId: "",
    version: 0,
    idempotencyKey: "",
    title: "",
    venues: [] as Venue[],
    venueIndex: 0,
    ...getDefaultActivityTimes(),
    capacity: "12",
    levels: LEVELS,
    levelIndex: 0,
    locationHint: "",
    feeNote: "",
    contact: "",
    contactVisibilities: CONTACT_VISIBILITIES,
    contactVisibilityIndex: 0,
    details: "",
    visibilities: VISIBILITIES,
    visibilityIndex: 0,
    groupingEnabled: false,
    scoringEnabled: false,
    message: "",
  },

  async onLoad(options: Record<string, string | undefined>) {
    try {
      await callCloud("auth.session");
      const [venueData, profileData] = await Promise.all([
        callCloud<{ venues: Venue[] }>("venue.list"),
        callCloud<ProfileData>("user.getMe"),
      ]);
      if (venueData.venues.length === 0) throw new Error("暂无可用场馆");
      this.setData({
        venues: venueData.venues,
        profileRequired: profileData.user.needsProfile,
        idempotencyKey: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      });
      if (options.id) await this.loadActivity(options.id, venueData.venues);
      this.setData({ loading: false });
      if (!options.id && profileData.user.needsProfile) await this.promptForProfile();
    } catch (error) {
      this.setData({
        loading: false,
        message: error instanceof Error ? error.message : "表单加载失败",
      });
    }
  },

  async onShow() {
    if (this.data.loading || !this.data.profileRequired) return;
    try {
      const profile = await callCloud<ProfileData>("user.getMe");
      this.setData({ profileRequired: profile.user.needsProfile });
    } catch {}
  },

  async promptForProfile() {
    const result = await wx.showModal({
      title: "请先设置昵称",
      content: "发布球局前需要一个昵称，方便球友识别组织者。学校和头像仍可不填。",
      confirmText: "去设置",
      cancelText: "稍后再说",
    });
    if (result.confirm) wx.navigateTo({ url: "/pages/profile/edit" });
  },

  async loadActivity(id: string, venues: Venue[]) {
    const result = await callCloud<{ activity: Activity }>("activity.get", { id });
    const activity = result.activity;
    const start = toChinaFormValue(activity.startAt);
    const end = toChinaFormValue(activity.endAt);
    const deadline = toChinaFormValue(activity.registrationDeadline);
    this.setData({
      activityId: activity.id,
      version: activity.version,
      title: activity.title,
      venueIndex: Math.max(
        0,
        venues.findIndex((venue) => venue.id === activity.venue.id),
      ),
      startDate: start.date,
      startTime: start.time,
      endDate: end.date,
      endTime: end.time,
      deadlineDate: deadline.date,
      deadlineTime: deadline.time,
      capacity: String(activity.capacity),
      levelIndex: Math.max(
        0,
        LEVELS.findIndex((item) => item.value === activity.level),
      ),
      locationHint: activity.locationHint ?? "",
      feeNote: activity.feeNote ?? "",
      contact: activity.contact ?? "",
      contactVisibilityIndex: Math.max(
        0,
        CONTACT_VISIBILITIES.findIndex((item) => item.value === activity.contactVisibility),
      ),
      details: activity.details ?? "",
      visibilityIndex: Math.max(
        0,
        VISIBILITIES.findIndex((item) => item.value === activity.visibility),
      ),
      groupingEnabled: activity.groupingEnabled,
      scoringEnabled: activity.scoringEnabled,
    });
    wx.setNavigationBarTitle({ title: "编辑球局" });
  },

  onTextInput(event: ValueEvent) {
    const field = event.currentTarget.dataset.field;
    if (typeof field === "string") this.setData({ [field]: event.detail.value });
  },
  onVenueChange(event: ValueEvent) {
    this.setData({ venueIndex: Number(event.detail.value) });
  },
  onLevelChange(event: ValueEvent) {
    this.setData({ levelIndex: Number(event.detail.value) });
  },
  onVisibilityChange(event: ValueEvent) {
    this.setData({ visibilityIndex: Number(event.detail.value) });
  },
  onContactVisibilityChange(event: ValueEvent) {
    this.setData({ contactVisibilityIndex: Number(event.detail.value) });
  },
  onGroupingChange(event: SwitchEvent) {
    this.setData({ groupingEnabled: event.detail.value });
  },
  onScoringChange(event: SwitchEvent) {
    this.setData({ scoringEnabled: event.detail.value });
  },

  async onSave() {
    if (this.data.saving) return;
    if (this.data.profileRequired) {
      await this.promptForProfile();
      return;
    }
    const venue = this.data.venues[this.data.venueIndex];
    const level = this.data.levels[this.data.levelIndex];
    const visibility = this.data.visibilities[this.data.visibilityIndex];
    const contactVisibility = this.data.contactVisibilities[this.data.contactVisibilityIndex];
    if (!venue || !level || !visibility || !contactVisibility) return;
    const payload = {
      title: this.data.title,
      venueId: venue.id,
      startAt: chinaFormToIso(this.data.startDate, this.data.startTime),
      endAt: chinaFormToIso(this.data.endDate, this.data.endTime),
      registrationDeadline: chinaFormToIso(this.data.deadlineDate, this.data.deadlineTime),
      capacity: Number(this.data.capacity),
      level: level.value,
      locationHint: this.data.locationHint,
      feeNote: this.data.feeNote,
      contact: this.data.contact,
      contactVisibility: contactVisibility.value,
      details: this.data.details,
      visibility: visibility.value,
      groupingEnabled: this.data.groupingEnabled,
      scoringEnabled: this.data.scoringEnabled,
    };
    this.setData({ saving: true, message: "正在保存" });
    try {
      const result = this.data.activityId
        ? await callCloud<{ activity: Activity }>("activity.update", {
            ...payload,
            id: this.data.activityId,
            version: this.data.version,
          })
        : await callCloud<{ activity: Activity }>("activity.create", {
            ...payload,
            idempotencyKey: this.data.idempotencyKey,
          });
      this.setData({ saving: false, message: "球局已保存" });
      wx.redirectTo({ url: `/pages/activities/detail?id=${result.activity.id}` });
    } catch (error) {
      this.setData({
        saving: false,
        message: error instanceof Error ? error.message : "保存失败，请稍后重试",
      });
    }
  },
});
