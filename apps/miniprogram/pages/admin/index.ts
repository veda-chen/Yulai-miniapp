import { callCloud } from "../../services/cloud-api";
import { formatChinaDateTime } from "../../utils/date";

type AdminTab = "OPEN" | "RESOLVED" | "DISMISSED" | "AUDIT";

type Report = {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  details: string;
  status: string;
  resolutionNote: string | null;
  createdAt: string | null;
  resolvedAt: string | null;
};

type ReportView = Report & {
  targetLabel: string;
  reasonLabel: string;
  statusLabel: string;
  createdAtText: string;
  resolvedAtText: string;
};

type AuditLog = {
  id: string;
  action: string;
  objectType: string;
  objectId: string;
  summary: string;
  createdAt: string | null;
};

type AuditView = AuditLog & {
  actionLabel: string;
  objectLabel: string;
  createdAtText: string;
};

const TABS: Array<{ key: AdminTab; label: string }> = [
  { key: "OPEN", label: "待处理" },
  { key: "RESOLVED", label: "已处理" },
  { key: "DISMISSED", label: "已驳回" },
  { key: "AUDIT", label: "操作记录" },
];

const TARGET_LABELS: Record<string, string> = {
  ACTIVITY: "球局",
  VENUE: "场馆",
  USER: "用户",
  REPORT: "举报",
};

const REASON_LABELS: Record<string, string> = {
  FALSE_INFO: "信息不实",
  ORGANIZER_UNREACHABLE: "组织者失联",
  CONTENT_INAPPROPRIATE: "内容不当",
  HARASSMENT: "骚扰行为",
  OTHER: "其他",
};

const ACTION_LABELS: Record<string, string> = {
  REPORT_RESOLVED: "处理举报",
  ACTIVITY_HIDDEN: "下架球局",
  USER_RESTRICTED: "限制账号",
  ACTIVITY_CANCELLED: "取消球局",
  ACTIVITY_STARTED: "开始球局",
  ACTIVITY_FINISHED: "结束球局",
  SCORE_LOCKED: "锁定比分",
  SCORE_UNLOCKED: "解锁比分",
};

function dateText(value: string | null): string {
  return value ? formatChinaDateTime(value) : "时间未记录";
}

function mapReport(report: Report): ReportView {
  return {
    ...report,
    targetLabel: TARGET_LABELS[report.targetType] ?? report.targetType,
    reasonLabel: REASON_LABELS[report.reason] ?? report.reason,
    statusLabel:
      report.status === "OPEN" ? "待处理" : report.status === "RESOLVED" ? "已处理" : "已驳回",
    createdAtText: dateText(report.createdAt),
    resolvedAtText: dateText(report.resolvedAt),
  };
}

function mapAudit(log: AuditLog): AuditView {
  return {
    ...log,
    actionLabel: ACTION_LABELS[log.action] ?? log.action,
    objectLabel: TARGET_LABELS[log.objectType] ?? log.objectType,
    createdAtText: dateText(log.createdAt),
  };
}

Page({
  data: {
    loading: true,
    processingId: "",
    metrics: { openReports: 0, activeUsers: 0, openActivities: 0 },
    tabs: TABS,
    activeTab: "OPEN" as AdminTab,
    reports: [] as ReportView[],
    logs: [] as AuditView[],
    errorMessage: "",
  },

  async loadContent(activeTab: AdminTab) {
    if (activeTab === "AUDIT") {
      const result = await callCloud<{ logs: AuditLog[] }>("admin.audit.list");
      this.setData({ logs: result.logs.map(mapAudit), reports: [] });
      return;
    }
    const result = await callCloud<{ reports: Report[] }>("admin.report.list", {
      status: activeTab,
    });
    this.setData({ reports: result.reports.map(mapReport), logs: [] });
  },

  async refresh() {
    this.setData({ loading: true, errorMessage: "" });
    try {
      const dashboardPromise = callCloud<{
        metrics: { openReports: number; activeUsers: number; openActivities: number };
      }>("admin.dashboard");
      const contentPromise = this.loadContent(this.data.activeTab as AdminTab);
      const [dashboard] = await Promise.all([dashboardPromise, contentPromise]);
      this.setData({ metrics: dashboard.metrics, loading: false });
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error instanceof Error ? error.message : "运营数据加载失败",
      });
    }
  },

  async onShow() {
    await this.refresh();
  },

  async onPullDownRefresh() {
    await this.refresh();
    wx.stopPullDownRefresh();
  },

  async onTabTap(event: WechatMiniprogram.TouchEvent) {
    const activeTab = String(event.currentTarget.dataset.key) as AdminTab;
    if (!TABS.some((tab) => tab.key === activeTab) || activeTab === this.data.activeTab) return;
    this.setData({ activeTab, loading: true, errorMessage: "" });
    try {
      await this.loadContent(activeTab);
      this.setData({ loading: false });
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error instanceof Error ? error.message : "列表加载失败",
      });
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
    this.setData({ processingId: id });
    try {
      await callCloud("admin.report.resolve", { id, outcome, note: prompt.content });
      wx.showToast({ title: "处置已记录", icon: "success" });
      await this.refresh();
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "处置失败", icon: "none" });
    } finally {
      this.setData({ processingId: "" });
    }
  },

  async moderateTarget(event: WechatMiniprogram.TouchEvent) {
    const targetType = String(event.currentTarget.dataset.targetType);
    const targetId = String(event.currentTarget.dataset.targetId);
    const reportId = String(event.currentTarget.dataset.reportId);
    const actionLabel = targetType === "ACTIVITY" ? "下架球局" : "限制账号";
    const prompt = await wx.showModal({
      title: actionLabel,
      content: "请填写处置原因；操作成功后该举报会自动结案。",
      editable: true,
      placeholderText: "处置原因",
    });
    if (!prompt.confirm || !prompt.content?.trim()) return;
    this.setData({ processingId: reportId });
    try {
      const action = targetType === "ACTIVITY" ? "admin.activity.unpublish" : "admin.user.restrict";
      await callCloud(action, { id: targetId, reason: prompt.content });
      await callCloud("admin.report.resolve", {
        id: reportId,
        outcome: "RESOLVED",
        note: `${actionLabel}：${prompt.content}`,
      });
      wx.showToast({ title: "处置并结案", icon: "success" });
      await this.refresh();
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "处置失败", icon: "none" });
      await this.refresh();
    } finally {
      this.setData({ processingId: "" });
    }
  },
});
