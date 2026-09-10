const LEVEL_LABELS: Record<string, string> = {
  ANY: "不限",
  CASUAL: "休闲",
  BEGINNER: "新手",
  IMPROVING: "进阶",
  COMPETITIVE: "对抗",
};

export function levelLabel(level: string): string {
  return LEVEL_LABELS[level] ?? "不限";
}
