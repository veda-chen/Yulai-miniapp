import { appearanceView, applyNativeAppearance, loadAppearanceState } from "../../utils/appearance";
import {
  generateFairRotationBatch,
  uniqueNames,
  type RotationRound,
} from "../../utils/tool-domain";
import { clearToolDraft, loadToolDraft, saveToolDraft } from "../../utils/tool-storage";

type FairRotationDraft = {
  namesInput: string;
  schedule: RotationRound[];
  confirmed: boolean;
};

type ScheduleView = {
  number: number;
  leftTop: string;
  leftBottom: string;
  rightTop: string;
  rightBottom: string;
};

const isNameList = (value: unknown, length: number) =>
  Array.isArray(value) &&
  value.length === length &&
  value.every((name) => typeof name === "string" && name.length > 0 && name.length <= 40);

const isSchedule = (value: unknown): value is RotationRound[] =>
  Array.isArray(value) &&
  value.length <= 40 &&
  value.every(
    (round, index) =>
      round &&
      round.number === index + 1 &&
      Array.isArray(round.matches) &&
      round.matches.length === 1 &&
      round.matches[0]?.court === 1 &&
      isNameList(round.matches[0]?.teamA, 2) &&
      isNameList(round.matches[0]?.teamB, 2) &&
      Array.isArray(round.waiting) &&
      round.waiting.every(
        (name: unknown) => typeof name === "string" && name.length > 0 && name.length <= 40,
      ),
  );

const isFairRotationDraft = (value: unknown): value is FairRotationDraft => {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<FairRotationDraft>;
  return (
    typeof draft.namesInput === "string" &&
    draft.namesInput.length <= 2000 &&
    isSchedule(draft.schedule) &&
    typeof draft.confirmed === "boolean"
  );
};

function scheduleViews(schedule: RotationRound[]): ScheduleView[] {
  return schedule.map((round) => {
    const match = round.matches[0];
    return {
      number: round.number,
      leftTop: match?.teamA[0] ?? "",
      leftBottom: match?.teamA[1] ?? "",
      rightTop: match?.teamB[0] ?? "",
      rightBottom: match?.teamB[1] ?? "",
    };
  });
}

Page({
  data: {
    ...appearanceView(),
    namesInput: "",
    playerCount: 0,
    schedule: [] as RotationRound[],
    scheduleViews: [] as ScheduleView[],
    previewVisible: false,
    confirmed: false,
  },

  onLoad() {
    const draft = loadToolDraft("rotation", isFairRotationDraft);
    if (!draft) return;
    this.setData({
      ...draft,
      playerCount: uniqueNames(draft.namesInput, 40).length,
      scheduleViews: scheduleViews(draft.schedule),
    });
  },

  onShow() {
    const state = loadAppearanceState();
    applyNativeAppearance(state.preferences);
    this.setData(appearanceView(state.preferences));
  },

  saveDraft() {
    saveToolDraft("rotation", {
      namesInput: this.data.namesInput,
      schedule: this.data.schedule,
      confirmed: this.data.confirmed,
    });
  },

  onNamesInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const namesInput = event.detail.value;
    this.setData({
      namesInput,
      playerCount: uniqueNames(namesInput, 40).length,
      schedule: [],
      scheduleViews: [],
      previewVisible: false,
      confirmed: false,
    });
    this.saveDraft();
  },

  createSchedule() {
    try {
      const names = uniqueNames(this.data.namesInput, 40);
      const schedule = generateFairRotationBatch({
        names,
        seed: `${Date.now()}:${Math.random()}`,
      });
      this.setData({
        schedule,
        scheduleViews: scheduleViews(schedule),
        previewVisible: true,
        confirmed: false,
      });
      this.saveDraft();
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : "无法生成赛程",
        icon: "none",
      });
    }
  },

  rerollSchedule() {
    this.createSchedule();
  },

  confirmSchedule() {
    if (this.data.schedule.length === 0) return;
    this.setData({ confirmed: true, previewVisible: false });
    this.saveDraft();
    wx.showToast({ title: "赛程已保存到本机", icon: "success" });
  },

  openSchedule() {
    if (this.data.schedule.length > 0) this.setData({ previewVisible: true });
  },

  closePreview() {
    this.setData({ previewVisible: false });
  },

  stopTap() {},

  preventTouchMove() {},

  async clearTool() {
    const result = await wx.showModal({
      title: "清空公平组队数据",
      content: "球友名单和已生成赛程将从本机删除。",
    });
    if (!result.confirm || !clearToolDraft("rotation")) return;
    this.setData({
      namesInput: "",
      playerCount: 0,
      schedule: [],
      scheduleViews: [],
      previewVisible: false,
      confirmed: false,
    });
  },
});
