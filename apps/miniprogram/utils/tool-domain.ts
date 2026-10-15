export type RotationMode = "SINGLES" | "DOUBLES";
export type RotationMatch = { court: number; teamA: string[]; teamB: string[] };
export type RotationRound = {
  number: number;
  matches: RotationMatch[];
  waiting: string[];
};

export type ExpenseInput = { label: string; amountText: string; payer: string };
export type ExpenseMemberResult = {
  name: string;
  owedCents: number;
  paidCents: number;
  balanceCents: number;
};
export type ExpenseTransfer = { from: string; to: string; amountCents: number };

export function uniqueNames(value: string, maximum = 100): string[] {
  const names = value
    .split(/[\n,，;；]+/)
    .map((name) => name.trim())
    .filter(Boolean);
  return [...new Set(names)].slice(0, maximum);
}

function hash(value: string): number {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

export function shuffled<T>(values: T[], seed = `${Date.now()}:${Math.random()}`): T[] {
  const result = [...values];
  let state = hash(seed);
  const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target] as T, result[index] as T];
  }
  return result;
}

function pairKey(left: string, right: string): string {
  return [left, right].sort().join("\u0000");
}

function rotationStats(history: RotationRound[]) {
  const games = new Map<string, number>();
  const lastPlayed = new Map<string, number>();
  const partners = new Map<string, number>();
  const opponents = new Map<string, number>();
  let latestPartners = new Set<string>();
  let latestOpponents = new Set<string>();
  history.forEach((round, roundIndex) => {
    const roundPartners = new Set<string>();
    const roundOpponents = new Set<string>();
    for (const match of round.matches) {
      const players = [...match.teamA, ...match.teamB];
      for (const player of players) {
        games.set(player, (games.get(player) ?? 0) + 1);
        lastPlayed.set(player, roundIndex);
      }
      for (const team of [match.teamA, match.teamB]) {
        if (team.length === 2) {
          const key = pairKey(team[0] ?? "", team[1] ?? "");
          partners.set(key, (partners.get(key) ?? 0) + 1);
          roundPartners.add(key);
        }
      }
      for (const left of match.teamA) {
        for (const right of match.teamB) {
          const key = pairKey(left, right);
          opponents.set(key, (opponents.get(key) ?? 0) + 1);
          roundOpponents.add(key);
        }
      }
    }
    if (roundIndex === history.length - 1) {
      latestPartners = roundPartners;
      latestOpponents = roundOpponents;
    }
  });
  return { games, lastPlayed, partners, opponents, latestPartners, latestOpponents };
}

function matchCost(
  teamA: string[],
  teamB: string[],
  stats: ReturnType<typeof rotationStats>,
): number {
  let cost = 0;
  for (const team of [teamA, teamB]) {
    if (team.length !== 2) continue;
    const key = pairKey(team[0] ?? "", team[1] ?? "");
    cost += (stats.partners.get(key) ?? 0) * 30;
    if (stats.latestPartners.has(key)) cost += 300;
  }
  for (const left of teamA) {
    for (const right of teamB) {
      const key = pairKey(left, right);
      cost += (stats.opponents.get(key) ?? 0) * 4;
      if (stats.latestOpponents.has(key)) cost += 40;
    }
  }
  return cost;
}

function arrangeGroup(
  group: string[],
  mode: RotationMode,
  stats: ReturnType<typeof rotationStats>,
): { teamA: string[]; teamB: string[] } {
  if (mode === "SINGLES") return { teamA: [group[0] ?? ""], teamB: [group[1] ?? ""] };
  const [a, b, c, d] = group;
  const options = [
    { teamA: [a ?? "", b ?? ""], teamB: [c ?? "", d ?? ""] },
    { teamA: [a ?? "", c ?? ""], teamB: [b ?? "", d ?? ""] },
    { teamA: [a ?? "", d ?? ""], teamB: [b ?? "", c ?? ""] },
  ];
  return options.sort(
    (left, right) =>
      matchCost(left.teamA, left.teamB, stats) - matchCost(right.teamA, right.teamB, stats),
  )[0] as { teamA: string[]; teamB: string[] };
}

function takeBestMatch(
  available: string[],
  mode: RotationMode,
  stats: ReturnType<typeof rotationStats>,
): { arranged: { teamA: string[]; teamB: string[] }; remaining: string[] } {
  const groupSize = mode === "SINGLES" ? 2 : 4;
  const anchor = available[0] as string;
  let bestIndices: number[] = [];
  let bestArrangement: { teamA: string[]; teamB: string[] } | null = null;
  let bestCost = Number.POSITIVE_INFINITY;

  const inspect = (indices: number[]) => {
    const group = [anchor, ...indices.map((index) => available[index] as string)];
    const arranged = arrangeGroup(group, mode, stats);
    const cost = matchCost(arranged.teamA, arranged.teamB, stats);
    if (cost < bestCost) {
      bestCost = cost;
      bestIndices = indices;
      bestArrangement = arranged;
    }
  };

  if (groupSize === 2) {
    for (let second = 1; second < available.length; second += 1) inspect([second]);
  } else {
    for (let second = 1; second < available.length - 2; second += 1) {
      for (let third = second + 1; third < available.length - 1; third += 1) {
        for (let fourth = third + 1; fourth < available.length; fourth += 1) {
          inspect([second, third, fourth]);
        }
      }
    }
  }

  const used = new Set([0, ...bestIndices]);
  return {
    arranged: bestArrangement ?? arrangeGroup(available.slice(0, groupSize), mode, stats),
    remaining: available.filter((_, index) => !used.has(index)),
  };
}

export function generateRotationRound(input: {
  names: string[];
  inactiveNames: string[];
  mode: RotationMode;
  courtCount: number;
  history: RotationRound[];
  seed?: string;
}): RotationRound {
  const groupSize = input.mode === "SINGLES" ? 2 : 4;
  const courts = Math.max(1, Math.min(12, Math.floor(input.courtCount)));
  const inactive = new Set(input.inactiveNames);
  const candidates = [...new Set(input.names)].filter((name) => !inactive.has(name));
  if (candidates.length < groupSize)
    throw new Error(
      input.mode === "SINGLES" ? "单打至少需要2名可上场球友" : "双打至少需要4名可上场球友",
    );
  const stats = rotationStats(input.history);
  const seeded = shuffled(candidates, input.seed ?? `${Date.now()}`);
  seeded.sort(
    (left, right) =>
      (stats.games.get(left) ?? 0) - (stats.games.get(right) ?? 0) ||
      (stats.lastPlayed.get(left) ?? -1) - (stats.lastPlayed.get(right) ?? -1),
  );
  const selectedCount = Math.min(courts, Math.floor(seeded.length / groupSize)) * groupSize;
  const selected = seeded.slice(0, selectedCount);
  const matches: RotationMatch[] = [];
  let available = selected;
  while (available.length >= groupSize) {
    const choice = takeBestMatch(available, input.mode, stats);
    matches.push({ court: matches.length + 1, ...choice.arranged });
    available = choice.remaining;
  }
  return {
    number: (input.history[input.history.length - 1]?.number ?? 0) + 1,
    matches,
    waiting: [...seeded.slice(selectedCount), ...input.names.filter((name) => inactive.has(name))],
  };
}

export function generateFairRotationBatch(input: {
  names: string[];
  seed?: string;
}): RotationRound[] {
  const names = [...new Set(input.names)];
  if (names.length < 4 || names.length > 40) throw new Error("公平组队需要4至40名球友");
  const seed = input.seed ?? `${Date.now()}:${Math.random()}`;
  const roster = shuffled(names, `${seed}:roster`);
  const partnershipKeys = new Set<string>();
  const partnerships: Array<[string, string]> = [];
  const addPartnership = (leftIndex: number, rightIndex: number, allowDuplicate = false) => {
    const left = roster[leftIndex] as string;
    const right = roster[rightIndex] as string;
    const key = pairKey(left, right);
    if (!allowDuplicate && partnershipKeys.has(key)) return;
    partnershipKeys.add(key);
    partnerships.push([left, right]);
  };
  for (let index = 0; index < roster.length; index += 1) {
    addPartnership(index, (index + 1) % roster.length);
    addPartnership(index, (index + 2) % roster.length);
  }
  if (roster.length === 4) {
    addPartnership(0, 1, true);
    addPartnership(2, 3, true);
  }

  const edges = shuffled(partnerships, `${seed}:partnerships`);
  const used = Array(edges.length).fill(false) as boolean[];
  const opponentCounts = new Map<string, number>();
  const matches: RotationMatch[] = [];
  const compatible = (left: [string, string], right: [string, string]) =>
    !left.includes(right[0]) && !left.includes(right[1]);
  const opponentKeys = (left: [string, string], right: [string, string]) =>
    left.flatMap((leftName) => right.map((rightName) => pairKey(leftName, rightName)));
  const pairEdges = (): boolean => {
    if (matches.length === names.length) return true;
    let anchorIndex = -1;
    let candidateIndices: number[] = [];
    for (let index = 0; index < edges.length; index += 1) {
      if (used[index]) continue;
      const candidates: number[] = [];
      for (let candidate = 0; candidate < edges.length; candidate += 1) {
        if (candidate === index || used[candidate]) continue;
        if (compatible(edges[index] as [string, string], edges[candidate] as [string, string])) {
          candidates.push(candidate);
        }
      }
      if (candidates.length === 0) return false;
      if (anchorIndex < 0 || candidates.length < candidateIndices.length) {
        anchorIndex = index;
        candidateIndices = candidates;
      }
    }
    const anchor = edges[anchorIndex] as [string, string];
    candidateIndices.sort((leftIndex, rightIndex) => {
      const leftCost = opponentKeys(anchor, edges[leftIndex] as [string, string]).reduce(
        (sum, key) => sum + (opponentCounts.get(key) ?? 0),
        0,
      );
      const rightCost = opponentKeys(anchor, edges[rightIndex] as [string, string]).reduce(
        (sum, key) => sum + (opponentCounts.get(key) ?? 0),
        0,
      );
      return leftCost - rightCost;
    });
    used[anchorIndex] = true;
    for (const candidateIndex of candidateIndices) {
      const candidate = edges[candidateIndex] as [string, string];
      const keys = opponentKeys(anchor, candidate);
      used[candidateIndex] = true;
      for (const key of keys) opponentCounts.set(key, (opponentCounts.get(key) ?? 0) + 1);
      matches.push({ court: 1, teamA: [...anchor], teamB: [...candidate] });
      if (pairEdges()) return true;
      matches.pop();
      for (const key of keys) {
        const next = (opponentCounts.get(key) ?? 1) - 1;
        if (next === 0) opponentCounts.delete(key);
        else opponentCounts.set(key, next);
      }
      used[candidateIndex] = false;
    }
    used[anchorIndex] = false;
    return false;
  };
  if (!pairEdges()) throw new Error("暂时无法生成公平赛程，请重新随机");

  const remaining = shuffled(matches, `${seed}:rounds`);
  const orderedMatches: RotationMatch[] = [];
  const lastPlayed = new Map(names.map((name) => [name, -names.length]));
  while (remaining.length > 0) {
    const previousMatch = orderedMatches[orderedMatches.length - 1];
    const previous = new Set(previousMatch ? [...previousMatch.teamA, ...previousMatch.teamB] : []);
    let bestIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    remaining.forEach((match, index) => {
      const players = [...match.teamA, ...match.teamB];
      const overlap = players.filter((name) => previous.has(name)).length;
      const recency = players.reduce((sum, name) => sum + (lastPlayed.get(name) ?? 0), 0);
      const score = overlap * names.length * 10 + recency;
      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    const [selected] = remaining.splice(bestIndex, 1);
    if (!selected) break;
    const roundIndex = orderedMatches.length;
    orderedMatches.push(selected);
    for (const name of [...selected.teamA, ...selected.teamB]) lastPlayed.set(name, roundIndex);
  }
  return orderedMatches.map((match, index) => ({
    number: index + 1,
    matches: [match],
    waiting: names.filter((name) => !match.teamA.includes(name) && !match.teamB.includes(name)),
  }));
}

export function parseMoneyToCents(value: string): number | null {
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole = "0", decimal = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  return cents >= 1 && cents <= 9_999_999 ? cents : null;
}

export function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

function minimumTransfers(entries: Array<{ name: string; balance: number }>): ExpenseTransfer[] {
  const memo = new Map<string, number>();
  const minimumCount = (input: number[]): number => {
    const values = input.filter(Boolean).sort((left, right) => left - right);
    if (values.length === 0) return 0;
    const key = values.join(",");
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    const first = values[0] as number;
    const exactMatch = values.findIndex((value, index) => index > 0 && value === -first);
    if (exactMatch > 0) {
      const next = values.slice(1);
      next[exactMatch - 1] = 0;
      const result = 1 + minimumCount(next);
      memo.set(key, result);
      return result;
    }
    const lowerBound = Math.max(
      values.filter((value) => value < 0).length,
      values.filter((value) => value > 0).length,
    );
    let best = values.length - 1;
    const tried = new Set<number>();
    for (let index = 1; index < values.length; index += 1) {
      const other = values[index] as number;
      if (first * other >= 0 || tried.has(other)) continue;
      tried.add(other);
      const next = values.slice(1);
      next[index - 1] = other + first;
      best = Math.min(best, 1 + minimumCount(next));
      if (best === lowerBound) break;
    }
    memo.set(key, best);
    return best;
  };
  const rebuild = (state: Array<{ name: string; balance: number }>): ExpenseTransfer[] => {
    const active = state.filter((entry) => entry.balance !== 0);
    if (active.length === 0) return [];
    const target = minimumCount(active.map((entry) => entry.balance));
    const first = active[0] as { name: string; balance: number };
    const tried = new Set<number>();
    const exactMatch = active.findIndex(
      (entry, index) => index > 0 && entry.balance === -first.balance,
    );
    const indices =
      exactMatch > 0
        ? [exactMatch]
        : Array.from({ length: active.length - 1 }, (_, index) => index + 1);
    for (const index of indices) {
      const other = active[index] as { name: string; balance: number };
      if (first.balance * other.balance >= 0 || tried.has(other.balance)) continue;
      tried.add(other.balance);
      const next = active.map((entry) => ({ ...entry }));
      const nextFirst = next[0] as { name: string; balance: number };
      const nextOther = next[index] as { name: string; balance: number };
      nextOther.balance += nextFirst.balance;
      nextFirst.balance = 0;
      if (1 + minimumCount(next.map((entry) => entry.balance)) !== target) continue;
      const transfer =
        first.balance < 0
          ? { from: first.name, to: other.name, amountCents: Math.abs(first.balance) }
          : { from: other.name, to: first.name, amountCents: Math.abs(first.balance) };
      return [transfer, ...rebuild(next)];
    }
    return [];
  };
  return rebuild(entries.map((entry) => ({ ...entry })));
}

export function settleExpenses(names: string[], expenses: ExpenseInput[]) {
  const participants = [...new Set(names)];
  if (participants.length < 2 || participants.length > 20) throw new Error("参与者需为2至20人");
  if (expenses.length < 1 || expenses.length > 30) throw new Error("费用需为1至30笔");
  const paid = new Map(participants.map((name) => [name, 0]));
  let totalCents = 0;
  for (const expense of expenses) {
    const cents = parseMoneyToCents(expense.amountText);
    if (cents === null) throw new Error("请输入正确的费用金额");
    if (!paid.has(expense.payer)) throw new Error("付款人必须在参与者名单中");
    totalCents += cents;
    if (totalCents > 99_999_999) throw new Error("总费用不能超过999999.99元");
    paid.set(expense.payer, (paid.get(expense.payer) ?? 0) + cents);
  }
  const base = Math.floor(totalCents / participants.length);
  const remainder = totalCents % participants.length;
  const members: ExpenseMemberResult[] = participants.map((name, index) => {
    const owedCents = base + (index < remainder ? 1 : 0);
    const paidCents = paid.get(name) ?? 0;
    return { name, owedCents, paidCents, balanceCents: paidCents - owedCents };
  });
  return {
    totalCents,
    members,
    transfers: minimumTransfers(
      members.map((member) => ({ name: member.name, balance: member.balanceCents })),
    ),
  };
}
