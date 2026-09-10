import { callCloud } from "../../services/cloud-api";

type Report = {
  _id: string;
  targetType: string;
  targetId: string;
  reason: string;
  details: string;
};

Page({
  data: {
    loading: true,
    metrics: { openReports: 0, activeUsers: 0, openActivities: 0 },
    reports: [] as Report[],
  },
  async onShow() {
    try {
      const [dashboard, reports] = await Promise.all([
        callCloud<{
          metrics: { openReports: number; activeUsers: number; openActivities: number };
        }>("admin.dashboard"),
        callCloud<{ reports: Report[] }>("admin.report.list", { status: "OPEN" }),
      ]);
      this.setData({ loading: false, metrics: dashboard.metrics, reports: reports.reports });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: error instanceof Error ? error.message : "加载失败", icon: "none" });
    }
  },
  async resolve(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id);
    const outcome = String(event.currentTarget.dataset.outcome);
    const prompt = await wx.showModal({
      title: outcome === "RESOLVED" ? "确认已处理" : "确认驳回",
      content: "请填写处置说明",
      editable: true,
      placeholderText: "处置依据和结果",
    });
    if (!prompt.confirm || !prompt.content?.trim()) return;
    await callCloud("admin.report.resolve", { id, outcome, note: prompt.content });
    await this.onShow();
  },
  async moderateTarget(event: WechatMiniprogram.TouchEvent) {
    const targetType = String(event.currentTarget.dataset.targetType);
    const targetId = String(event.currentTarget.dataset.targetId);
    const prompt = await wx.showModal({
      title: targetType === "ACTIVITY" ? "下架球局" : "限制账号",
      content: "请填写处置原因",
      editable: true,
      placeholderText: "处置原因",
    });
    if (!prompt.confirm || !prompt.content?.trim()) return;
    const action = targetType === "ACTIVITY" ? "admin.activity.unpublish" : "admin.user.restrict";
    await callCloud(action, { id: targetId, reason: prompt.content });
    wx.showToast({ title: "处置已记录", icon: "success" });
  },
});
