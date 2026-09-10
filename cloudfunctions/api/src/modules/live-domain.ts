import { AppError } from "../errors.js";

export type GroupingCandidate = { userId: string; level: string; gamesPlayed: number };
export type GeneratedMatch = {
  teamAUserIds: [string, string];
  teamBUserIds: [string, string];
};

const LEVEL_WEIGHT: Record<string, number> = {
  UNKNOWN: 0,
  CASUAL: 1,
  BEGINNER: 2,
  IMPROVING: 3,
  COMPETITIVE: 4,
};

function seededValue(seed: string): number {
  let value = 2166136261;
  for (const character of seed) {
    value ^= character.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export function generateBalancedMatches(
  candidates: GroupingCandidate[],
  courtCount: number,
  seed: string,
): GeneratedMatch[] {
  if (!Number.isInteger(courtCount) || courtCount < 1 || courtCount > 12) {
    throw new AppError("INVALID_ARGUMENT", "场地数量需为1至12");
  }
  const unique = new Map(candidates.map((candidate) => [candidate.userId, candidate]));
  if (unique.size !== candidates.length) throw new AppError("INVALID_ARGUMENT", "候选人不能重复");
  const matchCount = Math.min(courtCount, Math.floor(candidates.length / 4));
  if (matchCount < 1) throw new AppError("NOT_ENOUGH_PLAYERS", "至少需要4名已到场球友");
  const selected = [...candidates]
    .sort(
      (left, right) =>
        left.gamesPlayed - right.gamesPlayed ||
        seededValue(`${seed}:${left.userId}`) - seededValue(`${seed}:${right.userId}`),
    )
    .slice(0, matchCount * 4);

  const matches: GeneratedMatch[] = [];
  for (let index = 0; index < selected.length; index += 4) {
    const group = selected
      .slice(index, index + 4)
      .sort((left, right) => (LEVEL_WEIGHT[right.level] ?? 0) - (LEVEL_WEIGHT[left.level] ?? 0));
    const [first, second, third, fourth] = group;
    if (!first || !second || !third || !fourth) {
      throw new AppError("NOT_ENOUGH_PLAYERS", "分组人数不足");
    }
    matches.push({
      teamAUserIds: [first.userId, fourth.userId],
      teamBUserIds: [second.userId, third.userId],
    });
  }
  return matches;
}

export function validateBadmintonScore(scoreA: number, scoreB: number): void {
  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB) || scoreA < 0 || scoreB < 0) {
    throw new AppError("INVALID_ARGUMENT", "比分必须是非负整数");
  }
  if (scoreA > 30 || scoreB > 30 || scoreA === scoreB) {
    throw new AppError("INVALID_ARGUMENT", "比分不符合单局30分封顶规则");
  }
  const winner = Math.max(scoreA, scoreB);
  const loser = Math.min(scoreA, scoreB);
  if (winner < 21 || (winner < 30 && winner - loser < 2)) {
    throw new AppError("INVALID_ARGUMENT", "需至少21分且领先2分，30分封顶");
  }
}

export function teamForUser(
  userId: string,
  teamAUserIds: string[],
  teamBUserIds: string[],
): "A" | "B" | null {
  if (teamAUserIds.includes(userId)) return "A";
  if (teamBUserIds.includes(userId)) return "B";
  return null;
}
