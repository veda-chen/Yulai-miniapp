import { callCloud } from "../../services/cloud-api";

type Participant = { userId: string; nickname: string; attendanceStatus: string };
type Round = { id: string; roundNo: number; status: string; version: number };
type Match = {
  id: string;
  roundId: string | null;
  courtLabel: string;
  teamA: Array<{ userId: string; nickname: string }>;
  teamB: Array<{ userId: string; nickname: string }>;
  matchType: "SINGLES" | "DOUBLES";
  status: string;
  scoreA: number | null;
  scoreB: number | null;
  confirmations: string[];
  version: number;
};
type LiveData = {
  activity: {
    id: string;
    title: string;
    status: string;
    groupingEnabled: boolean;
    scoringEnabled: boolean;
    canManage: boolean;
  };
  participants: Participant[];
  rounds: Round[];
  matches: Match[];
  currentUserId: string;
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "待发布",
  SCHEDULED: "待开打",
  PENDING_CONFIRMATION: "待确认",
  LOCKED: "已锁定",
  VOID: "已作废",
};

Page({
  activityId: "",
  data: {
    loading: true,
    submitting: false,
    message: "",
    activity: null as LiveData["activity"] | null,
    participants: [] as Participant[],
    rounds: [] as Round[],
    matches: [] as Array<
      Match & {
        teamAText: string;
        teamBText: string;
        statusText: string;
        inputScoreA: string;
        inputScoreB: string;
        isPlayer: boolean;
        confirmationText: string;
      }
    >,
    courtOptions: ["1片场", "2片场", "3片场", "4片场", "5片场", "6片场"],
    courtIndex: 0,
    matchTypes: [
      { value: "SINGLES", label: "单打", playerCount: 2 },
      { value: "DOUBLES", label: "双打", playerCount: 4 },
    ],
    matchTypeIndex: 0,
    selectedPlayers: [] as string[],
    statsText: "暂无锁定战绩",
  },

  onLoad(options: Record<string, string | undefined>) {
    this.activityId = options.id ?? "";
  },
  async onShow() {
    if (this.activityId) await this.load();
  },
  async onPullDownRefresh() {
    await this.load();
    wx.stopPullDownRefresh();
  },

  async load() {
    try {
      this.setData({ loading: true, message: "" });
      const [result, stats] = await Promise.all([
        callCloud<LiveData>("live.get", { activityId: this.activityId }),
        callCloud<{
          stats: { games: number; wins: number; losses: number; winRate: number | null };
        }>("score.stats"),
      ]);
      this.setData({
        loading: false,
        activity: result.activity,
        participants: result.participants,
        rounds: result.rounds,
        matches: result.matches.map((match) => ({
          ...match,
          teamAText: match.teamA.map((item) => item.nickname).join(" / "),
          teamBText: match.teamB.map((item) => item.nickname).join(" / "),
          statusText: STATUS_LABELS[match.status] ?? match.status,
          inputScoreA: match.scoreA === null ? "" : String(match.scoreA),
          inputScoreB: match.scoreB === null ? "" : String(match.scoreB),
          isPlayer: [...match.teamA, ...match.teamB].some(
            (item) => item.userId === result.currentUserId,
          ),
          confirmationText: match.confirmations.join("、"),
        })),
        statsText: stats.stats.games
          ? `${stats.stats.games} 场 · ${stats.stats.wins} 胜 · 胜率 ${stats.stats.winRate}%`
          : "暂无锁定战绩",
      });
      wx.setNavigationBarTitle({ title: result.activity.title });
    } catch (error) {
      this.setData({
        loading: false,
        message: error instanceof Error ? error.message : "现场信息加载失败",
      });
    }
  },

  onCourtChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ courtIndex: Number(event.detail.value) });
  },
  onPlayerChange(event: WechatMiniprogram.CustomEvent<{ value: string[] }>) {
    this.setData({ selectedPlayers: event.detail.value });
  },
  onMatchTypeChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ matchTypeIndex: Number(event.detail.value), selectedPlayers: [] });
  },
  onScoreInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const index = Number(event.currentTarget.dataset.index);
    const field = event.currentTarget.dataset.side === "A" ? "inputScoreA" : "inputScoreB";
    this.setData({ [`matches[${index}].${field}`]: event.detail.value });
  },

  async generateRound() {
    await this.run(
      "grouping.generate",
      { activityId: this.activityId, courtCount: this.data.courtIndex + 1 },
      "分组建议已生成",
    );
  },
  async publishRound(event: WechatMiniprogram.BaseEvent) {
    await this.run(
      "grouping.publish",
      { roundId: event.currentTarget.dataset.id },
      "本轮安排已发布",
    );
  },
  async updateDraftMatch(event: WechatMiniprogram.BaseEvent) {
    const match = this.data.matches[Number(event.currentTarget.dataset.index)];
    if (!match || this.data.selectedPlayers.length !== 4) {
      wx.showToast({ title: "请先在上方选择4人", icon: "none" });
      return;
    }
    await this.run(
      "grouping.update",
      {
        matchId: match.id,
        version: match.version,
        teamAUserIds: this.data.selectedPlayers.slice(0, 2),
        teamBUserIds: this.data.selectedPlayers.slice(2, 4),
      },
      "分组已调整",
    );
  },
  async createMatch() {
    const matchType = this.data.matchTypes[this.data.matchTypeIndex];
    if (!matchType || this.data.selectedPlayers.length !== matchType.playerCount) {
      wx.showToast({
        title: matchType?.value === "SINGLES" ? "请选择2名不同球友" : "请选择4名不同球友",
        icon: "none",
      });
      return;
    }
    const teamSize = matchType.playerCount / 2;
    await this.run(
      "match.create",
      {
        activityId: this.activityId,
        matchType: matchType.value,
        teamAUserIds: this.data.selectedPlayers.slice(0, teamSize),
        teamBUserIds: this.data.selectedPlayers.slice(teamSize, matchType.playerCount),
        idempotencyKey: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      },
      "对局已创建",
    );
    this.setData({ selectedPlayers: [] });
  },
  async submitScore(event: WechatMiniprogram.BaseEvent) {
    const match = this.data.matches[Number(event.currentTarget.dataset.index)];
    if (match)
      await this.run(
        "score.submit",
        {
          matchId: match.id,
          version: match.version,
          scoreA: Number(match.inputScoreA),
          scoreB: Number(match.inputScoreB),
        },
        "比分已提交",
      );
  },
  async confirmScore(event: WechatMiniprogram.BaseEvent) {
    const match = this.data.matches[Number(event.currentTarget.dataset.index)];
    if (match)
      await this.run("score.confirm", { matchId: match.id, version: match.version }, "比分已确认");
  },
  async lockScore(event: WechatMiniprogram.BaseEvent) {
    const match = this.data.matches[Number(event.currentTarget.dataset.index)];
    if (match)
      await this.run(
        "score.lock",
        {
          matchId: match.id,
          version: match.version,
          scoreA: Number(match.inputScoreA),
          scoreB: Number(match.inputScoreB),
        },
        "比分已锁定",
      );
  },
  async unlockScore(event: WechatMiniprogram.BaseEvent) {
    const match = this.data.matches[Number(event.currentTarget.dataset.index)];
    if (!match) return;
    const prompt = await wx.showModal({
      title: "解锁比分",
      content: "请填写更正原因",
      editable: true,
      placeholderText: "原因将写入修订记录",
    });
    if (prompt.confirm && prompt.content?.trim())
      await this.run(
        "score.unlock",
        { matchId: match.id, version: match.version, reason: prompt.content },
        "比分已解锁",
      );
  },
  async run(action: string, payload: unknown, success: string) {
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    try {
      await callCloud(action, payload);
      wx.showToast({ title: success, icon: "success" });
      await this.load();
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "操作失败", icon: "none" });
      if (error instanceof Error && error.message.includes("刷新")) await this.load();
    } finally {
      this.setData({ submitting: false });
    }
  },
});
