type ScoreSnapshot = { scoreA: number; scoreB: number };

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
  },

  onNameInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const field = event.currentTarget.dataset.side === "A" ? "nameA" : "nameB";
    this.setData({ [field]: event.detail.value });
    this.refreshStatus();
  },

  changeScore(event: WechatMiniprogram.TouchEvent) {
    if (this.data.finished && event.currentTarget.dataset.delta === "1") return;
    const side = event.currentTarget.dataset.side === "A" ? "A" : "B";
    const delta = Number(event.currentTarget.dataset.delta);
    const field = side === "A" ? "scoreA" : "scoreB";
    const current = side === "A" ? this.data.scoreA : this.data.scoreB;
    const next = Math.max(0, Math.min(30, current + delta));
    if (next === current) return;
    this.history.push({ scoreA: this.data.scoreA, scoreB: this.data.scoreB });
    this.setData({ [field]: next });
    this.refreshStatus();
  },

  undo() {
    const previous = this.history.pop();
    if (!previous) {
      wx.showToast({ title: "还没有可撤回的比分", icon: "none" });
      return;
    }
    this.setData(previous);
    this.refreshStatus();
  },

  async reset() {
    const result = await wx.showModal({ title: "重新开始", content: "当前比分将清零。" });
    if (!result.confirm) return;
    this.history = [];
    this.setData({ scoreA: 0, scoreB: 0 });
    this.refreshStatus();
  },

  refreshStatus() {
    const nameA = this.data.nameA.trim() || "A方";
    const nameB = this.data.nameB.trim() || "B方";
    const statusText = resultText(this.data.scoreA, this.data.scoreB, nameA, nameB);
    this.setData({ statusText, finished: statusText.endsWith("获胜") });
  },
});
