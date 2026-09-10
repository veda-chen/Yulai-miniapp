import { callCloud } from "../../services/cloud-api";

type ValueEvent = WechatMiniprogram.CustomEvent<{ value: string }>;
const REASONS = [
  { value: "FALSE_INFO", label: "信息不实" },
  { value: "ORGANIZER_UNREACHABLE", label: "组织者失联" },
  { value: "CONTENT_INAPPROPRIATE", label: "内容不当" },
  { value: "HARASSMENT", label: "骚扰行为" },
  { value: "OTHER", label: "其他" },
];

Page({
  targetType: "ACTIVITY",
  targetId: "",
  data: { reasons: REASONS, reasonIndex: 0, details: "", saving: false },
  onLoad(options: Record<string, string | undefined>) {
    this.targetType = options.type ?? "ACTIVITY";
    this.targetId = options.id ?? "";
  },
  onReasonChange(event: ValueEvent) {
    this.setData({ reasonIndex: Number(event.detail.value) });
  },
  onDetailsInput(event: ValueEvent) {
    this.setData({ details: event.detail.value });
  },
  async submit() {
    if (this.data.saving) return;
    this.setData({ saving: true });
    try {
      await callCloud("report.create", {
        targetType: this.targetType,
        targetId: this.targetId,
        reason: this.data.reasons[this.data.reasonIndex]?.value,
        details: this.data.details,
      });
      await wx.showModal({
        title: "举报已提交",
        content: "运营人员会根据记录进行核查。",
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
