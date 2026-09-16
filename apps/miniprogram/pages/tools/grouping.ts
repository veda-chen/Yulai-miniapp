type Match = {
  court: number;
  teamA: string;
  teamB: string;
};

function uniqueNames(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\n,，;；]+/)
        .map((name) => name.trim())
        .filter(Boolean),
    ),
  ];
}

function shuffle<T>(values: T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target] as T, result[index] as T];
  }
  return result;
}

Page({
  data: {
    namesInput: "",
    playerCount: 0,
    modeOptions: [
      { value: "DOUBLES", label: "双打", groupSize: 4 },
      { value: "SINGLES", label: "单打", groupSize: 2 },
    ],
    modeIndex: 0,
    courtOptions: ["1片场", "2片场", "3片场", "4片场", "5片场", "6片场"],
    courtIndex: 0,
    matches: [] as Match[],
    waiting: [] as string[],
    waitingText: "",
    generated: false,
  },

  onNamesInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const namesInput = event.detail.value;
    this.setData({ namesInput, playerCount: uniqueNames(namesInput).length, generated: false });
  },

  onModeChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ modeIndex: Number(event.detail.value), generated: false });
  },

  onCourtChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ courtIndex: Number(event.detail.value), generated: false });
  },

  generate() {
    const mode = this.data.modeOptions[this.data.modeIndex];
    if (!mode) return;
    const players = shuffle(uniqueNames(this.data.namesInput));
    if (players.length < mode.groupSize) {
      wx.showToast({
        title: mode.value === "SINGLES" ? "单打至少需要2人" : "双打至少需要4人",
        icon: "none",
      });
      return;
    }
    const matchCount = Math.min(
      this.data.courtIndex + 1,
      Math.floor(players.length / mode.groupSize),
    );
    const matches: Match[] = [];
    for (let index = 0; index < matchCount; index += 1) {
      const group = players.slice(index * mode.groupSize, (index + 1) * mode.groupSize);
      matches.push({
        court: index + 1,
        teamA:
          mode.value === "SINGLES" ? (group[0] ?? "") : `${group[0] ?? ""} / ${group[3] ?? ""}`,
        teamB:
          mode.value === "SINGLES" ? (group[1] ?? "") : `${group[1] ?? ""} / ${group[2] ?? ""}`,
      });
    }
    this.setData({
      matches,
      waiting: players.slice(matchCount * mode.groupSize),
      waitingText: players.slice(matchCount * mode.groupSize).join("、"),
      generated: true,
    });
  },
});
