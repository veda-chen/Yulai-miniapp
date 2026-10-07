import { CloudApiError, callCloud } from "../../services/cloud-api";
import {
  type AppearancePreferences,
  type AppearancePresetId,
  appearanceView,
  applyAppearancePreset,
  applyNativeAppearance,
  DEFAULT_APPEARANCE,
  type HomeModuleId,
  loadAppearanceState,
  normalizeAppearance,
  saveAppearanceState,
  type ToolId,
} from "../../utils/appearance";
import { canonicalToolId, expandVisibleToolOrder, visibleToolIds } from "../../utils/tool-registry";

type Venue = { id: string; name: string; verificationStatus: string };
type CloudAppearance = { preferences: AppearancePreferences | null; version: number };
const MODULE_LABELS: Record<HomeModuleId, string> = { tools: "快捷工具", venues: "常用场馆" };
const TOOL_LABELS: Record<ToolId, string> = {
  grouping: "公平组队",
  scoring: "临时计分",
  rotation: "公平组队",
  draw: "公平组队",
  expense: "费用均摊",
  rules: "规则速查",
};

function preferenceSignature(preferences: AppearancePreferences): string {
  return JSON.stringify(normalizeAppearance(preferences));
}

Page({
  data: {
    ...appearanceView(),
    draft: { ...DEFAULT_APPEARANCE } as AppearancePreferences,
    savedPreferences: { ...DEFAULT_APPEARANCE } as AppearancePreferences,
    modules: [] as Array<{ id: HomeModuleId; label: string; visible: boolean }>,
    tools: [] as Array<{ id: ToolId; label: string; onHome: boolean }>,
    venues: [] as Array<Venue & { selected: boolean }>,
    saving: false,
    syncing: false,
    pendingSync: false,
    syncMessage: "仅在本机生效",
    hasUnsavedChanges: false,
  },

  async onLoad() {
    const state = loadAppearanceState();
    this.setData({
      draft: state.preferences,
      savedPreferences: state.preferences,
      pendingSync: state.pendingSync,
    });
    this.refreshDerived();
    try {
      const result = await callCloud<{ venues: Venue[] }>("venue.list");
      const knownIds = new Set(result.venues.map((venue) => venue.id));
      const unavailable = state.preferences.favoriteVenueIds
        .filter((id) => !knownIds.has(id))
        .map((id) => ({
          id,
          name: `已不可用场馆（${id.slice(0, 8)}）`,
          verificationStatus: "UNAVAILABLE",
        }));
      this.setData({
        venues: [...result.venues, ...unavailable].map((venue) => ({
          ...venue,
          selected: state.preferences.favoriteVenueIds.includes(venue.id),
        })),
      });
    } catch {
      wx.showToast({ title: "场馆列表暂时无法加载", icon: "none" });
    }
  },

  refreshDerived() {
    const draft = normalizeAppearance(this.data.draft);
    const view = appearanceView(draft);
    this.setData({
      draft,
      ...view,
      modules: draft.moduleOrder.map((id) => ({
        id,
        label: MODULE_LABELS[id],
        visible: draft.visibleModules.includes(id),
      })),
      tools: visibleToolIds(draft.toolOrder).map((id) => ({
        id,
        label: TOOL_LABELS[id],
        onHome: draft.homeToolIds.map(canonicalToolId).includes(id),
      })),
      venues: this.data.venues.map((venue) => ({
        ...venue,
        selected: draft.favoriteVenueIds.includes(venue.id),
      })),
      syncMessage: draft.syncEnabled
        ? this.data.pendingSync
          ? "本机已保存，等待同步"
          : "已开启跨设备同步"
        : "仅在本机生效",
      hasUnsavedChanges:
        preferenceSignature(draft) !== preferenceSignature(this.data.savedPreferences),
    });
  },

  applyPreset(event: WechatMiniprogram.TouchEvent) {
    const presetId = event.currentTarget.dataset.id as AppearancePresetId;
    this.setData({ draft: applyAppearancePreset(this.data.draft, presetId) });
    this.refreshDerived();
  },

  choose(event: WechatMiniprogram.TouchEvent) {
    const field = event.currentTarget.dataset.field as keyof AppearancePreferences;
    this.setData({ [`draft.${field}`]: event.currentTarget.dataset.value });
    this.refreshDerived();
  },

  previewPrimaryAction() {
    wx.showToast({ title: "主要操作预览", icon: "none" });
  },

  previewSecondaryAction() {
    wx.showToast({ title: "次要操作预览", icon: "none" });
  },

  toggleHero(event: WechatMiniprogram.SwitchChange) {
    this.setData({ "draft.showHero": event.detail.value });
    this.refreshDerived();
  },

  toggleModule(event: WechatMiniprogram.SwitchChange) {
    const id = event.currentTarget.dataset.id as HomeModuleId;
    const visibleModules = event.detail.value
      ? [...this.data.draft.visibleModules, id]
      : this.data.draft.visibleModules.filter((item) => item !== id);
    this.setData({ "draft.visibleModules": [...new Set(visibleModules)] });
    this.refreshDerived();
  },

  moveModule(event: WechatMiniprogram.TouchEvent) {
    this.move(
      "moduleOrder",
      event.currentTarget.dataset.id,
      Number(event.currentTarget.dataset.delta),
    );
  },

  moveTool(event: WechatMiniprogram.TouchEvent) {
    const id = event.currentTarget.dataset.id as ToolId;
    const order = visibleToolIds(this.data.draft.toolOrder);
    const index = order.indexOf(id);
    const target = index + Number(event.currentTarget.dataset.delta);
    if (index < 0 || target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target] as ToolId, next[index] as ToolId];
    this.setData({ "draft.toolOrder": expandVisibleToolOrder(next) });
    this.refreshDerived();
  },

  toggleHomeTool(event: WechatMiniprogram.SwitchChange) {
    const id = event.currentTarget.dataset.id as ToolId;
    const aliases: ToolId[] = id === "rotation" ? ["grouping", "rotation", "draw"] : [id];
    const current = this.data.draft.homeToolIds.filter((item) => !aliases.includes(item));
    if (event.detail.value && !current.includes(id) && current.length >= 4) {
      wx.showToast({ title: "首页最多展示4项工具", icon: "none" });
      this.refreshDerived();
      return;
    }
    this.setData({
      "draft.homeToolIds": event.detail.value ? [...new Set([...current, id])] : current,
    });
    this.refreshDerived();
  },

  move(field: "moduleOrder" | "toolOrder", id: string, delta: number) {
    const order = [...this.data.draft[field]] as string[];
    const index = order.indexOf(id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= order.length) return;
    const current = order[index];
    const replacement = order[target];
    if (current === undefined || replacement === undefined) return;
    order[index] = replacement;
    order[target] = current;
    this.setData({ [`draft.${field}`]: order });
    this.refreshDerived();
  },

  toggleVenue(event: WechatMiniprogram.TouchEvent) {
    const id = event.currentTarget.dataset.id as string;
    const selected = this.data.draft.favoriteVenueIds;
    if (!selected.includes(id) && selected.length >= 3) {
      wx.showToast({ title: "最多选择3个常用场馆", icon: "none" });
      return;
    }
    this.setData({
      "draft.favoriteVenueIds": selected.includes(id)
        ? selected.filter((item) => item !== id)
        : [...selected, id],
    });
    this.refreshDerived();
  },

  resetDraft() {
    this.setData({
      draft: {
        ...DEFAULT_APPEARANCE,
        moduleOrder: [...DEFAULT_APPEARANCE.moduleOrder],
        visibleModules: [],
        toolOrder: [...DEFAULT_APPEARANCE.toolOrder],
        homeToolIds: [...DEFAULT_APPEARANCE.homeToolIds],
        favoriteVenueIds: [],
      },
    });
    this.refreshDerived();
  },

  toggleSync(event: WechatMiniprogram.SwitchChange) {
    this.setData({ "draft.syncEnabled": event.detail.value });
    this.refreshDerived();
  },

  async enableSync(preferences: AppearancePreferences) {
    const session = await callCloud<{ user: { id: string } }>("auth.session");
    const remote = await callCloud<CloudAppearance>("appearance.get");
    let selected = normalizeAppearance({ ...preferences, syncEnabled: true });
    let version = remote.version;
    if (remote.preferences) {
      const choice = await wx.showModal({
        title: "发现云端设置",
        content: "选择“使用云端”会替换当前设置；选择“保留本机”会用本机设置覆盖云端。",
        confirmText: "使用云端",
        cancelText: "保留本机",
      });
      if (choice.confirm)
        selected = normalizeAppearance({ ...remote.preferences, syncEnabled: true });
      else {
        const saved = await callCloud<CloudAppearance>("appearance.save", {
          preferences: selected,
          baseVersion: remote.version,
        });
        version = saved.version;
      }
    } else {
      const saved = await callCloud<CloudAppearance>("appearance.save", {
        preferences: selected,
        baseVersion: 0,
      });
      version = saved.version;
    }
    saveAppearanceState({
      preferences: selected,
      serverVersion: version,
      pendingSync: false,
      syncUserId: session.user.id,
    });
    this.setData({ draft: selected, pendingSync: false, ...appearanceView(selected) });
    return selected;
  },

  async save() {
    if (this.data.saving) return;
    let preferences = normalizeAppearance(this.data.draft);
    const previous = loadAppearanceState();
    if (preferences.syncEnabled && !previous.syncUserId) {
      this.setData({ saving: true, syncing: true });
      try {
        preferences = await this.enableSync(preferences);
        applyNativeAppearance(preferences);
        this.setData({ savedPreferences: preferences });
        this.refreshDerived();
        wx.showToast({ title: "设置已保存", icon: "success" });
      } catch (error) {
        wx.showToast({
          title: error instanceof Error ? error.message : "同步开启失败，设置尚未保存",
          icon: "none",
        });
      } finally {
        this.setData({ saving: false, syncing: false });
      }
      return;
    }
    const pendingSync = preferences.syncEnabled;
    try {
      saveAppearanceState({
        preferences,
        serverVersion: previous.serverVersion,
        pendingSync,
        syncUserId: preferences.syncEnabled ? previous.syncUserId : null,
      });
    } catch {
      wx.showToast({ title: "保存失败，请重试", icon: "none" });
      return;
    }
    applyNativeAppearance(preferences);
    this.setData({ saving: true, pendingSync, ...appearanceView(preferences) });
    let resultMessage = "设置已保存";
    let resultIcon: "success" | "none" = "success";
    if (preferences.syncEnabled) {
      try {
        const result = await callCloud<CloudAppearance>("appearance.save", {
          preferences,
          baseVersion: previous.serverVersion,
        });
        saveAppearanceState({
          preferences,
          serverVersion: result.version,
          pendingSync: false,
          syncUserId: previous.syncUserId,
        });
        this.setData({ pendingSync: false });
      } catch (error) {
        try {
          if (error instanceof CloudApiError && error.code === "APPEARANCE_VERSION_CONFLICT") {
            await this.resolveConflict(preferences);
          } else {
            resultMessage = "已保存到本机，云同步稍后重试";
            resultIcon = "none";
          }
        } catch {
          resultMessage = "已保存到本机，云同步稍后重试";
          resultIcon = "none";
        }
      }
    }
    const savedPreferences = loadAppearanceState().preferences;
    this.setData({ saving: false, draft: savedPreferences, savedPreferences });
    this.refreshDerived();
    wx.showToast({ title: resultMessage, icon: resultIcon });
  },

  async resolveConflict(local: AppearancePreferences) {
    const remote = await callCloud<CloudAppearance>("appearance.get");
    if (!remote.preferences) return;
    const choice = await wx.showModal({
      title: "设置同步冲突",
      content: "另一台设备已更新设置，请选择要保留的版本。",
      confirmText: "保留本机",
      cancelText: "使用云端",
    });
    if (choice.confirm) {
      const result = await callCloud<CloudAppearance>("appearance.save", {
        preferences: local,
        baseVersion: remote.version,
      });
      saveAppearanceState({
        preferences: local,
        serverVersion: result.version,
        pendingSync: false,
        syncUserId: loadAppearanceState().syncUserId,
      });
    } else {
      const preferences = normalizeAppearance({ ...remote.preferences, syncEnabled: true });
      saveAppearanceState({
        preferences,
        serverVersion: remote.version,
        pendingSync: false,
        syncUserId: loadAppearanceState().syncUserId,
      });
      this.setData({ draft: preferences, pendingSync: false, ...appearanceView(preferences) });
      applyNativeAppearance(preferences);
    }
  },
});
