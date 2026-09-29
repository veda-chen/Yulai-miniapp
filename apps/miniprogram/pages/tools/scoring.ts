import { appearanceView, applyNativeAppearance, loadAppearanceState } from "../../utils/appearance";
import { loadToolDraft, saveToolDraft } from "../../utils/tool-storage";

type ScoreSnapshot = { scoreA: number; scoreB: number };
type ScoreDraft = {
  nameA: string;
  nameB: string;
  scoreA: number;
  scoreB: number;
  history: ScoreSnapshot[];
};
const isScoreDraft = (value: unknown): value is ScoreDraft => {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ScoreDraft>;
  const validScore = (score: unknown) =>
    Number.isInteger(score) && Number(score) >= 0 && Number(score) <= 30;
  return (
    typeof item.nameA === "string" &&
    item.nameA.length <= 20 &&
    typeof item.nameB === "string" &&
    item.nameB.length <= 20 &&
    validScore(item.scoreA) &&
    validScore(item.scoreB) &&
    Array.isArray(item.history) &&
    item.history.length <= 100 &&
    item.history.every((snapshot) => validScore(snapshot.scoreA) && validScore(snapshot.scoreB))
  );
};
function resultText(scoreA: number, scoreB: number, nameA: string, nameB: string): string {
  const winner = Math.max(scoreA, scoreB);
  const loser = Math.min(scoreA, scoreB);
  if (winner === 30 || (winner >= 21 && winner - loser >= 2)) {
    return `${scoreA > scoreB ? nameA : nameB} 获胜`;
  }
  if (scoreA >= 20 && scoreB >= 20) return "加分赛 · 领先2分获胜，30分封顶";
  return "进行中 · 21分制";
}

Page({
  history: [] as ScoreSnapshot[],
  data: {
    nameA: "A方",
    nameB: "B方",
    scoreA: 0,
    scoreB: 0,
    statusText: "进行中 · 21分制",
    finished: false,
    ...appearanceView(),
  },

  onLoad() {
    const draft = loadToolDraft("scoring", isScoreDraft);
    if (!draft) return;
    this.history = draft.history;
    this.setData({
      nameA: draft.nameA,
      nameB: draft.nameB,
      scoreA: draft.scoreA,
      scoreB: draft.scoreB,
    });
    this.refreshStatus();
  },

  onShow() {
    const state = loadAppearanceState();
    applyNativeAppearance(state.preferences);
    this.setData(appearanceView(state.preferences));
  },

  onBoardNameChange(event: WechatMiniprogram.CustomEvent<{ side: string; value: string }>) {
    const field = event.detail.side === "A" ? "nameA" : "nameB";
    this.setData({ [field]: event.detail.value });
    this.refreshStatus();
    this.saveDraft();
  },

  onBoardScoreChange(event: WechatMiniprogram.CustomEvent<{ side: string; delta: number }>) {
    this.applyScoreChange(event.detail.side, event.detail.delta);
  },

  applyScoreChange(sideValue: string, delta: number) {
    if (this.data.finished && delta === 1) return;
    const side = sideValue === "A" ? "A" : "B";
    const field = side === "A" ? "scoreA" : "scoreB";
    const current = side === "A" ? this.data.scoreA : this.data.scoreB;
    const next = Math.max(0, Math.min(30, current + delta));
    if (next === current) return;
    this.history.push({ scoreA: this.data.scoreA, scoreB: this.data.scoreB });
    this.setData({ [field]: next });
    this.refreshStatus();
    this.saveDraft();
  },

  undo() {
    const previous = this.history.pop();
    if (!previous) {
      wx.showToast({ title: "还没有可撤回的比分", icon: "none" });
      return;
    }
    this.setData(previous);
    this.refreshStatus();
    this.saveDraft();
  },

  async reset() {
    const result = await wx.showModal({ title: "重新开始", content: "当前比分将清零。" });
    if (!result.confirm) return;
    this.history = [];
    this.setData({ scoreA: 0, scoreB: 0 });
    this.refreshStatus();
    this.saveDraft();
  },

  refreshStatus() {
    const nameA = this.data.nameA.trim() || "A方";
    const nameB = this.data.nameB.trim() || "B方";
    const statusText = resultText(this.data.scoreA, this.data.scoreB, nameA, nameB);
    this.setData({ statusText, finished: statusText.endsWith("获胜") });
  },

  saveDraft() {
    saveToolDraft("scoring", {
      nameA: this.data.nameA,
      nameB: this.data.nameB,
      scoreA: this.data.scoreA,
      scoreB: this.data.scoreB,
      history: this.history.slice(-100),
    });
  },
});
