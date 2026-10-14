import { callCloud } from "../../services/cloud-api";
import { type ActivityFormErrors, validateActivityForm } from "../../utils/activity-experience";
import { getDefaultActivityTimes, toChinaFormValue } from "../../utils/date";
import { appearanceView, applyNativeAppearance, loadAppearanceState } from "../../utils/appearance";

type ValueEvent = WechatMiniprogram.CustomEvent<{ value: string }>;
type SwitchEvent = WechatMiniprogram.CustomEvent<{ value: boolean }>;
type Venue = { id: string; name: string; unavailable?: boolean };
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

type ActivityFormDraft = {
  idempotencyKey: string;
  title: string;
  venueId: string;
  venueName?: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  deadlineDate: string;
  deadlineTime: string;
  capacity: string;
  levelIndex: number;
  locationHint: string;
  feeNote: string;
  contact: string;
  contactVisibilityIndex: number;
  details: string;
  visibilityIndex: number;
  groupingEnabled: boolean;
  scoringEnabled: boolean;
};

const FORM_DRAFT_KEY = "yulai:activity-form:v1";
const FORM_DRAFT_RETENTION = 7 * 24 * 60 * 60 * 1000;

function loadFormDraft(): ActivityFormDraft | null {
  try {
    const stored = wx.getStorageSync(FORM_DRAFT_KEY) as {
      schemaVersion?: unknown;
      updatedAt?: unknown;
      data?: unknown;
    };
    if (
      stored?.schemaVersion !== 1 ||
      typeof stored.updatedAt !== "number" ||
      stored.updatedAt > Date.now() ||
      Date.now() - stored.updatedAt > FORM_DRAFT_RETENTION ||
      !stored.data ||
      typeof stored.data !== "object"
    ) {
      wx.removeStorageSync(FORM_DRAFT_KEY);
      return null;
    }
    const data = stored.data as Partial<ActivityFormDraft>;
    if (
      typeof data.idempotencyKey !== "string" ||
      typeof data.title !== "string" ||
      typeof data.venueId !== "string" ||
      (data.venueName !== undefined && typeof data.venueName !== "string") ||
      typeof data.startDate !== "string" ||
      typeof data.startTime !== "string" ||
      typeof data.endDate !== "string" ||
      typeof data.endTime !== "string" ||
      typeof data.deadlineDate !== "string" ||
      typeof data.deadlineTime !== "string" ||
      typeof data.capacity !== "string" ||
      !Number.isInteger(data.levelIndex) ||
      typeof data.locationHint !== "string" ||
      typeof data.feeNote !== "string" ||
      typeof data.contact !== "string" ||
      !Number.isInteger(data.contactVisibilityIndex) ||
      typeof data.details !== "string" ||
      !Number.isInteger(data.visibilityIndex) ||
      typeof data.groupingEnabled !== "boolean" ||
      typeof data.scoringEnabled !== "boolean"
    ) {
      wx.removeStorageSync(FORM_DRAFT_KEY);
      return null;
    }
    return data as ActivityFormDraft;
  } catch {
    return null;
  }
}

function clearFormDraft() {
  try {
    wx.removeStorageSync(FORM_DRAFT_KEY);
    return true;
  } catch {
    return false;
  }
}

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
  draftTimer: null as ReturnType<typeof setTimeout> | null,
  initialActivityTimes: getDefaultActivityTimes(),
  requestedActivityId: "",
  data: {
    loading: true,
    saving: false,
    copying: false,
    confirmingPublish: false,
    moreOpen: false,
    profileRequired: false,
    activityId: "",
    version: 0,
    idempotencyKey: "",
    title: "",
    venues: [] as Venue[],
    venueIndex: 0,
    venueUnavailable: false,
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
    draftMessage: "",
    fieldErrors: {} as ActivityFormErrors,
    loadFailed: false,
    publishedActivityId: "",
    ...appearanceView(),
  },

  async onLoad(options: Record<string, string | undefined>) {
    this.initialActivityTimes = getDefaultActivityTimes();
    this.setData(this.initialActivityTimes);
    this.requestedActivityId = options.id ?? "";
    await this.initialize();
  },

  async initialize() {
    this.setData({ loading: true, loadFailed: false, message: "" });
    try {
      await callCloud("auth.session");
      const [venueData, profileData] = await Promise.all([
        callCloud<{ venues: Venue[] }>("venue.list"),
        callCloud<ProfileData>("user.getMe"),
      ]);
      if (venueData.venues.length === 0 && !this.requestedActivityId)
        throw new Error("暂无可用场馆，请稍后重试");
      this.setData({
        venues: venueData.venues,
        profileRequired: profileData.user.needsProfile,
        idempotencyKey: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      });
      if (this.requestedActivityId)
        await this.loadActivity(this.requestedActivityId, venueData.venues);
      this.setData({ loading: false });
      if (!this.requestedActivityId) await this.offerDraftRestore();
    } catch (error) {
      this.setData({
        loading: false,
        loadFailed: true,
        message: error instanceof Error ? error.message : "表单加载失败",
      });
    }
  },

  async retryInitialize() {
    await this.initialize();
  },

  async onShow() {
    const appearance = loadAppearanceState();
    applyNativeAppearance(appearance.preferences);
    this.setData(appearanceView(appearance.preferences));
    if (this.data.loading || !this.data.profileRequired) return;
    try {
      const profile = await callCloud<ProfileData>("user.getMe");
      this.setData({ profileRequired: profile.user.needsProfile });
    } catch {}
  },
  onHide() {
    this.flushDraft();
  },
  onUnload() {
    this.flushDraft();
  },

  goToProfile() {
    wx.navigateTo({ url: "/pages/profile/edit" });
  },

  toggleMore() {
    this.setData({ moreOpen: !this.data.moreOpen });
  },

  async copyLatestActivity() {
    if (
      this.data.activityId ||
      this.data.saving ||
      this.data.copying ||
      this.data.confirmingPublish
    )
      return;
    this.setData({ copying: true, message: "" });
    try {
      const result = await callCloud<{ activity: Activity | null }>("activity.latestCreated");
      const activity = result.activity;
      if (!activity) {
        this.setData({ message: "你还没有创建过球局" });
        return;
      }
      if (
        this.data.title.trim() ||
        this.data.details.trim() ||
        this.data.locationHint.trim() ||
        loadFormDraft()
      ) {
        const confirmation = await wx.showModal({
          title: "用上次球局替换当前内容？",
          content: "当前填写的内容和本机草稿将被替换，已发布的球局不受影响。",
          confirmText: "替换内容",
        });
        if (!confirmation.confirm) return;
      }
      const availableVenues = this.data.venues.filter((venue) => !venue.unavailable);
      let venues = availableVenues;
      let venueIndex = venues.findIndex((venue) => venue.id === activity.venue.id);
      const venueUnavailable = venueIndex < 0;
      if (venueUnavailable) {
        venues = [
          ...venues,
          {
            id: activity.venue.id,
            name: `${activity.venue.name}（当前不可用）`,
            unavailable: true,
          },
        ];
        venueIndex = venues.length - 1;
      }
      this.setData(
        {
          title: activity.title,
          venues,
          venueIndex,
          venueUnavailable,
          ...getDefaultActivityTimes(),
          capacity: String(activity.capacity),
          levelIndex: Math.max(
            0,
            LEVELS.findIndex((item) => item.value === activity.level),
          ),
          locationHint: "",
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
          idempotencyKey: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
          fieldErrors: {},
          moreOpen: false,
          message: venueUnavailable
            ? "已复制；原场馆不可用，请重新选择场馆"
            : "已复制上次球局，请确认新时间和场馆",
        },
        () => this.saveDraft(),
      );
    } catch (error) {
      this.setData({
        message: error instanceof Error ? error.message : "复制上次球局失败，请重试",
      });
    } finally {
      this.setData({ copying: false });
    }
  },

  clearErrors(keys: Array<keyof ActivityFormErrors>) {
    const fieldErrors = { ...this.data.fieldErrors };
    keys.forEach((key) => {
      delete fieldErrors[key];
    });
    return fieldErrors;
  },

  async loadActivity(id: string, venues: Venue[]) {
    const result = await callCloud<{ activity: Activity }>("activity.get", { id });
    const activity = result.activity;
    const start = toChinaFormValue(activity.startAt);
    const end = toChinaFormValue(activity.endAt);
    const deadline = toChinaFormValue(activity.registrationDeadline);
    let availableVenues = venues;
    let venueIndex = venues.findIndex((venue) => venue.id === activity.venue.id);
    const venueUnavailable = venueIndex < 0;
    if (venueUnavailable) {
      availableVenues = [
        ...venues,
        { id: activity.venue.id, name: `${activity.venue.name}（当前不可用）`, unavailable: true },
      ];
      venueIndex = availableVenues.length - 1;
    }
    this.setData({
      activityId: activity.id,
      version: activity.version,
      title: activity.title,
      venues: availableVenues,
      venueIndex,
      venueUnavailable,
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
    if (typeof field === "string") {
      const errorKeys: Array<keyof ActivityFormErrors> =
        field === "title"
          ? ["title"]
          : field === "capacity"
            ? ["capacity"]
            : field === "startDate" || field === "startTime"
              ? ["startAt", "endAt", "deadline"]
              : field === "endDate" || field === "endTime"
                ? ["endAt"]
                : field === "deadlineDate" || field === "deadlineTime"
                  ? ["deadline"]
                  : [];
      this.setData({ [field]: event.detail.value, fieldErrors: this.clearErrors(errorKeys) }, () =>
        this.scheduleDraftSave(),
      );
    }
  },
  onVenueChange(event: ValueEvent) {
    const venueIndex = Number(event.detail.value);
    this.setData(
      {
        venueIndex,
        venueUnavailable: this.data.venues[venueIndex]?.unavailable === true,
        fieldErrors: this.clearErrors(["venue"]),
      },
      () => this.saveDraft(),
    );
  },
  onLevelChange(event: ValueEvent) {
    this.setData({ levelIndex: Number(event.detail.value) }, () => this.saveDraft());
  },
  onVisibilityChange(event: ValueEvent) {
    this.setData({ visibilityIndex: Number(event.detail.value) }, () => this.saveDraft());
  },
  onContactVisibilityChange(event: ValueEvent) {
    this.setData({ contactVisibilityIndex: Number(event.detail.value) }, () => this.saveDraft());
  },
  onGroupingChange(event: SwitchEvent) {
    this.setData({ groupingEnabled: event.detail.value }, () => this.saveDraft());
  },
  onScoringChange(event: SwitchEvent) {
    this.setData({ scoringEnabled: event.detail.value }, () => this.saveDraft());
  },

  scheduleDraftSave() {
    if (this.draftTimer !== null) clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => {
      this.draftTimer = null;
      this.saveDraft();
    }, 400);
  },
  flushDraft() {
    if (this.draftTimer === null) return;
    clearTimeout(this.draftTimer);
    this.draftTimer = null;
    this.saveDraft();
  },
  saveDraft() {
    if (this.draftTimer !== null) {
      clearTimeout(this.draftTimer);
      this.draftTimer = null;
    }
    if (
      this.data.loading ||
      this.data.saving ||
      this.data.activityId ||
      this.data.publishedActivityId
    )
      return;
    const venue = this.data.venues[this.data.venueIndex];
    const data: ActivityFormDraft = {
      idempotencyKey: this.data.idempotencyKey,
      title: this.data.title,
      venueId: venue?.id ?? "",
      venueName: venue?.name ?? "",
      startDate: this.data.startDate,
      startTime: this.data.startTime,
      endDate: this.data.endDate,
      endTime: this.data.endTime,
      deadlineDate: this.data.deadlineDate,
      deadlineTime: this.data.deadlineTime,
      capacity: this.data.capacity,
      levelIndex: this.data.levelIndex,
      locationHint: this.data.locationHint,
      feeNote: this.data.feeNote,
      contact: this.data.contact,
      contactVisibilityIndex: this.data.contactVisibilityIndex,
      details: this.data.details,
      visibilityIndex: this.data.visibilityIndex,
      groupingEnabled: this.data.groupingEnabled,
      scoringEnabled: this.data.scoringEnabled,
    };
    try {
      wx.setStorageSync(FORM_DRAFT_KEY, { schemaVersion: 1, updatedAt: Date.now(), data });
      this.setData({ draftMessage: "草稿已保存到本机" });
    } catch {
      this.setData({ draftMessage: "草稿保存失败，请检查本机存储空间" });
    }
  },

  async offerDraftRestore() {
    const draft = loadFormDraft();
    if (!draft) return;
    const result = await wx.showModal({
      title: "恢复未发布的球局",
      content: "检测到7天内保存的创建草稿，是否继续填写？",
      confirmText: "恢复草稿",
      cancelText: "重新填写",
    });
    if (!result.confirm) {
      clearFormDraft();
      return;
    }
    let venues = this.data.venues;
    let venueIndex = venues.findIndex((venue) => venue.id === draft.venueId);
    const venueUnavailable = venueIndex < 0;
    if (venueUnavailable) {
      venues = [
        ...venues,
        {
          id: draft.venueId,
          name: `${draft.venueName || "草稿中的原场馆"}（当前不可用）`,
          unavailable: true,
        },
      ];
      venueIndex = venues.length - 1;
    }
    this.setData({
      ...draft,
      venues,
      venueIndex,
      venueUnavailable,
      levelIndex: Math.min(LEVELS.length - 1, Math.max(0, draft.levelIndex)),
      visibilityIndex: Math.min(VISIBILITIES.length - 1, Math.max(0, draft.visibilityIndex)),
      contactVisibilityIndex: Math.min(
        CONTACT_VISIBILITIES.length - 1,
        Math.max(0, draft.contactVisibilityIndex),
      ),
      message: venueUnavailable
        ? "已恢复草稿；原场馆当前不可用，请重新选择"
        : "已恢复上次未发布的内容",
      draftMessage: "草稿已保存到本机",
    });
  },

  async clearDraft() {
    if (this.data.activityId || this.data.saving) return;
    const confirmation = await wx.showModal({
      title: "清空创建草稿？",
      content: "当前填写的内容会被清除，并恢复默认时间和选项。",
      confirmText: "确认清空",
      confirmColor: "#d93025",
    });
    if (!confirmation.confirm || this.data.saving || this.data.publishedActivityId) return;
    if (!clearFormDraft()) {
      this.setData({ draftMessage: "草稿清理失败，请检查本机存储空间" });
      return;
    }
    this.setData({
      title: "",
      venueIndex: 0,
      venueUnavailable: this.data.venues[0]?.unavailable === true,
      ...this.initialActivityTimes,
      capacity: "12",
      levelIndex: 0,
      locationHint: "",
      feeNote: "",
      contact: "",
      contactVisibilityIndex: 0,
      details: "",
      visibilityIndex: 0,
      groupingEnabled: false,
      scoringEnabled: false,
      fieldErrors: {},
      message: "",
      draftMessage: "草稿已清空",
      idempotencyKey: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    });
  },

  scrollToFirstError(errors: ActivityFormErrors) {
    const selector =
      errors.title || errors.venue
        ? "#section-basic"
        : errors.startAt || errors.endAt || errors.deadline
          ? "#section-time"
          : "#section-participants";
    wx.pageScrollTo({ selector, duration: 250 });
  },

  async onSave() {
    if (this.data.saving || this.data.confirmingPublish || this.data.copying) return;
    if (this.data.publishedActivityId) {
      this.viewPublishedActivity();
      return;
    }
    if (this.data.profileRequired) {
      this.goToProfile();
      return;
    }
    const venue = this.data.venues[this.data.venueIndex];
    const level = this.data.levels[this.data.levelIndex];
    const visibility = this.data.visibilities[this.data.visibilityIndex];
    const contactVisibility = this.data.contactVisibilities[this.data.contactVisibilityIndex];
    if (!venue || !level || !visibility || !contactVisibility) return;
    const validation = validateActivityForm({
      title: this.data.title,
      venueId: venue.id,
      venueUnavailable: venue.unavailable === true,
      startDate: this.data.startDate,
      startTime: this.data.startTime,
      endDate: this.data.endDate,
      endTime: this.data.endTime,
      deadlineDate: this.data.deadlineDate,
      deadlineTime: this.data.deadlineTime,
      capacity: this.data.capacity,
    });
    if (!validation.values) {
      this.setData({ fieldErrors: validation.errors, message: "请检查标出的球局信息" });
      this.scrollToFirstError(validation.errors);
      return;
    }
    const payload = {
      title: validation.values.title,
      venueId: venue.id,
      startAt: validation.values.startAt,
      endAt: validation.values.endAt,
      registrationDeadline: validation.values.registrationDeadline,
      capacity: validation.values.capacity,
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
    if (!this.data.activityId) {
      this.setData({ confirmingPublish: true });
      try {
        const confirmation = await wx.showModal({
          title: "确认发布球局",
          content: `${payload.title}\n${this.data.startDate} ${this.data.startTime}–${this.data.endTime}\n${venue.name}\n${payload.capacity} 人 · ${visibility.label}`,
          confirmText: "确认发布",
        });
        if (!confirmation.confirm) return;
      } catch {
        this.setData({ message: "无法确认发布，请重试" });
        return;
      } finally {
        this.setData({ confirmingPublish: false });
      }
    }
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
      const cleanupFailed = !this.data.activityId && !clearFormDraft();
      const target = `/pages/activities/detail?id=${result.activity.id}${this.data.activityId ? "" : "&created=1"}`;
      this.setData({
        message: this.data.activityId ? "修改已保存" : "球局已发布",
        ...(cleanupFailed
          ? { draftMessage: "球局已发布，但本机草稿清理失败，请稍后手动清空" }
          : {}),
        publishedActivityId: result.activity.id,
      });
      wx.redirectTo({
        url: target,
        fail: () => {
          this.setData({
            saving: false,
            message: this.data.activityId
              ? "修改已保存，可点击下方按钮返回球局"
              : "球局已发布，可点击下方按钮查看",
          });
        },
      });
    } catch (error) {
      this.setData({
        saving: false,
        message: error instanceof Error ? error.message : "保存失败，请稍后重试",
      });
    }
  },

  viewPublishedActivity() {
    if (!this.data.publishedActivityId) return;
    wx.redirectTo({
      url: `/pages/activities/detail?id=${encodeURIComponent(this.data.publishedActivityId)}${this.data.activityId ? "" : "&created=1"}`,
      fail: () => this.setData({ message: "球局已保存，暂时无法打开，请再次点击查看球局" }),
    });
  },
});
