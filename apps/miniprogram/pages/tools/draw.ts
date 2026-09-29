import { appearanceView, applyNativeAppearance, loadAppearanceState } from "../../utils/appearance";
import { shuffled, uniqueNames } from "../../utils/tool-domain";
import { clearToolDraft, saveToolDraft } from "../../utils/tool-storage";

Page({
  data: {
    ...appearanceView(),
    namesInput: "",
    modes: [
      { label: "抽出人选", value: "PICK" },
      { label: "随机顺序", value: "ORDER" },
      { label: "搭档配对", value: "PAIR" },
      { label: "对阵抽签", value: "MATCH" },
    ],
    modeIndex: 0,
    pickCount: 1,
    matchTypes: [
      { label: "单打", size: 2 },
      { label: "双打", size: 4 },
    ],
    matchTypeIndex: 0,
    resultLines: [] as string[],
    resultTime: "",
  },
  onLoad() {
    wx.redirectTo({ url: "/pages/tools/rotation" });
  },
  onShow() {
    const state = loadAppearanceState();
    applyNativeAppearance(state.preferences);
    this.setData(appearanceView(state.preferences));
  },
  saveDraft() {
    saveToolDraft("draw", {
      namesInput: this.data.namesInput,
      modeIndex: this.data.modeIndex,
      pickCount: this.data.pickCount,
      matchTypeIndex: this.data.matchTypeIndex,
      resultLines: this.data.resultLines,
      resultTime: this.data.resultTime,
    });
  },
  onNamesInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ namesInput: event.detail.value, resultLines: [], resultTime: "" });
    this.saveDraft();
  },
  chooseMode(event: WechatMiniprogram.TouchEvent) {
    this.setData({
      modeIndex: Number(event.currentTarget.dataset.index),
      resultLines: [],
      resultTime: "",
    });
    this.saveDraft();
  },
  onPickCount(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({
      pickCount: Math.min(100, Math.max(1, Math.floor(Number(event.detail.value) || 1))),
      resultLines: [],
      resultTime: "",
    });
    this.saveDraft();
  },
  onMatchType(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ matchTypeIndex: Number(event.detail.value), resultLines: [], resultTime: "" });
    this.saveDraft();
  },
  generate() {
    const names = uniqueNames(this.data.namesInput, 100);
    if (names.length < 2) {
      wx.showToast({ title: "至少输入2名球友", icon: "none" });
      return;
    }
    const values = shuffled(names, `${Date.now()}:${Math.random()}`);
    const lines: string[] = [];
    if (this.data.modeIndex === 0) {
      const count = Math.min(names.length, Math.max(1, this.data.pickCount));
      lines.push(`抽中：${values.slice(0, count).join("、")}`);
    } else if (this.data.modeIndex === 1) {
      values.forEach((name, index) => {
        lines.push(`${index + 1}. ${name}`);
      });
    } else if (this.data.modeIndex === 2) {
      for (let index = 0; index + 1 < values.length; index += 2)
        lines.push(`搭档 ${index / 2 + 1}：${values[index]} / ${values[index + 1]}`);
      if (values.length % 2) lines.push(`候补：${values[values.length - 1]}`);
    } else {
      const size = this.data.matchTypes[this.data.matchTypeIndex]?.size ?? 2;
      let court = 1;
      for (let index = 0; index + size - 1 < values.length; index += size) {
        lines.push(
          size === 2
            ? `${court}号场：${values[index]} VS ${values[index + 1]}`
            : `${court}号场：${values[index]} / ${values[index + 1]} VS ${values[index + 2]} / ${values[index + 3]}`,
        );
        court += 1;
      }
      const used = Math.floor(values.length / size) * size;
      if (used < values.length) lines.push(`候补：${values.slice(used).join("、")}`);
    }
    const now = new Date();
    this.setData({
      resultLines: lines,
      resultTime: `${now.getMonth() + 1}月${now.getDate()}日 ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    });
    this.saveDraft();
  },
  async clearTool() {
    const result = await wx.showModal({
      title: "清空抽签数据",
      content: "名单和最近结果将从本机删除。",
    });
    if (!result.confirm) return;
    if (!clearToolDraft("draw")) return;
    this.setData({
      namesInput: "",
      modeIndex: 0,
      pickCount: 1,
      matchTypeIndex: 0,
      resultLines: [],
      resultTime: "",
    });
  },
});
