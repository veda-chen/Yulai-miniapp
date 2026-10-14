import { appearanceView, applyNativeAppearance, loadAppearanceState } from "../../utils/appearance";
import { clearAllToolDrafts, cleanupExpiredToolDrafts } from "../../utils/tool-storage";
import { TOOL_DEFINITIONS, VISIBLE_TOOL_IDS, visibleToolIds } from "../../utils/tool-registry";

Page({
  data: { ...appearanceView(), tools: VISIBLE_TOOL_IDS.map((id) => TOOL_DEFINITIONS[id]) },
  onShow() {
    const state = loadAppearanceState();
    cleanupExpiredToolDrafts();
    applyNativeAppearance(state.preferences);
    (this.getTabBar?.() as { refresh?: () => void } | null)?.refresh?.();
    this.setData({
      ...appearanceView(state.preferences),
      tools: visibleToolIds(state.preferences.toolOrder).map((id) => TOOL_DEFINITIONS[id]),
    });
  },
  async clearDrafts() {
    const result = await wx.showModal({
      title: "清空临时数据",
      content: "临时计分、公平组队和费用草稿将从本机删除。",
    });
    if (!result.confirm) return;
    if (clearAllToolDrafts()) wx.showToast({ title: "已清空", icon: "success" });
  },
});
