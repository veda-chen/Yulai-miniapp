import { callCloud } from "../../services/cloud-api";
import { appearanceView, applyNativeAppearance, loadAppearanceState } from "../../utils/appearance";

type ValueEvent = WechatMiniprogram.CustomEvent<{ value: string }>;
const GENERAL_REASONS = [
  { value: "FALSE_INFO", label: "信息不实" },
  { value: "ORGANIZER_UNREACHABLE", label: "组织者失联" },
  { value: "CONTENT_INAPPROPRIATE", label: "内容不当" },
  { value: "HARASSMENT", label: "骚扰行为" },
  { value: "OTHER", label: "其他" },
];
const VENUE_REASONS = [
  { value: "FALSE_INFO", label: "场馆信息有误" },
  { value: "OTHER", label: "补充或更新资料" },
];

Page({
  targetType: "ACTIVITY",
  targetId: "",
  data: {
    reasons: GENERAL_REASONS,
    reasonIndex: 0,
    details: "",
    detailsError: "",
    targetError: "",
    canSubmit: false,
    saving: false,
    submitted: false,
    pageTitle: "提交举报",
    reasonLabel: "举报原因",
    detailsLabel: "补充说明",
    placeholder: "请描述具体情况，便于核查",
    submitText: "提交举报",
    ...appearanceView(),
  },
  onLoad(options: Record<string, string | undefined>) {
    const appearance = loadAppearanceState();
    applyNativeAppearance(appearance.preferences);
    this.setData(appearanceView(appearance.preferences));
    this.targetType = options.type === "VENUE" ? "VENUE" : (options.type ?? "ACTIVITY");
    this.targetId = options.id ?? "";
    if (!this.targetId) this.setData({ targetError: "链接缺少提交对象，请返回后重新进入" });
    if (this.targetType === "VENUE") {
      this.setData({
        reasons: VENUE_REASONS,
        pageTitle: "场馆资料纠错",
        reasonLabel: "问题类型",
        detailsLabel: "正确资料或补充说明",
        placeholder: "请说明有误之处和正确内容；如有资料来源也可以一并填写",
        submitText: "提交纠错",
      });
      wx.setNavigationBarTitle({ title: "场馆资料纠错" });
    }
  },
  onReasonChange(event: ValueEvent) {
    this.setData({ reasonIndex: Number(event.detail.value) });
  },
  onDetailsInput(event: ValueEvent) {
    const details = event.detail.value;
    this.setData({
      details,
      detailsError: "",
      canSubmit: Boolean(this.targetId && details.trim()),
    });
  },
  onDetailsBlur() {
    if (!this.data.details.trim()) this.setData({ detailsError: "请填写具体说明" });
  },
  async submit() {
    if (this.data.saving || this.data.submitted) return;
    if (!this.targetId) {
      this.setData({ targetError: "链接缺少提交对象，请返回后重新进入" });
      return;
    }
    const details = this.data.details.trim();
    if (!details) {
      this.setData({ detailsError: "请填写具体说明", canSubmit: false });
      return;
    }
    this.setData({ saving: true });
    try {
      await callCloud("report.create", {
        targetType: this.targetType,
        targetId: this.targetId,
        reason: this.data.reasons[this.data.reasonIndex]?.value,
        details,
      });
      this.setData({ submitted: true, canSubmit: false });
      const isVenue = this.targetType === "VENUE";
      await wx.showModal({
        title: isVenue ? "纠错已提交" : "举报已提交",
        content: isVenue ? "运营人员核实后会更新场馆资料。" : "运营人员会根据记录进行核查。",
        showCancel: false,
      });
      wx.navigateBack();
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "提交失败", icon: "none" });
    } finally {
      this.setData({ saving: false });
    }
  },
});
