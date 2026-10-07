import assert from "node:assert/strict";
import {
  formatCents,
  generateFairRotationBatch,
  generateRotationRound,
  parseMoneyToCents,
  settleExpenses,
  shuffled,
  uniqueNames,
} from "../apps/miniprogram/utils/tool-domain.ts";
import {
  duplicateParticipantErrors,
  mergeParticipantValues,
  participantValues,
  removeParticipantValue,
} from "../apps/miniprogram/utils/participant-editor.ts";
import { expandVisibleToolOrder, visibleToolIds } from "../apps/miniprogram/utils/tool-registry.ts";
import { clearAllToolDrafts, isFreshToolDraft } from "../apps/miniprogram/utils/tool-storage.ts";

assert.deepEqual(uniqueNames("阿羽\n阿来，阿羽"), ["阿羽", "阿来"]);
assert.deepEqual(participantValues("", 4, 40), ["", "", "", ""]);
assert.deepEqual(participantValues("阿羽\n阿来", 4, 40), ["阿羽", "阿来", "", ""]);
assert.deepEqual(duplicateParticipantErrors(["阿羽", "阿来", "阿羽", ""]), [
  "与第3位球友重名",
  "",
  "与第1位球友重名",
  "",
]);
assert.deepEqual(removeParticipantValue(["A", "B", "C", "D"], 1, 4), ["A", "C", "D", ""]);
assert.deepEqual(mergeParticipantValues(["A", "", "C", ""], "B，C；D\nE", 5), {
  values: ["A", "B", "C", "D", "E"],
  imported: 3,
  skipped: 1,
});
assert.equal(
  participantValues(Array.from({ length: 45 }, (_, index) => `P${index}`).join("\n"), 4, 40).length,
  40,
);
for (const count of [4, 5, 6, 8, 12, 40]) {
  const names = Array.from({ length: count }, (_, index) => `球友${index + 1}`);
  const schedule = generateFairRotationBatch({ names, seed: `batch-${count}` });
  assert.equal(schedule.length, count);
  assert.equal(
    schedule.every((round) => round.matches.length === 1),
    true,
  );
  const appearances = new Map(names.map((name) => [name, 0]));
  const partners = new Map(names.map((name) => [name, new Map()]));
  for (const round of schedule) {
    const players = [...round.matches[0].teamA, ...round.matches[0].teamB];
    assert.equal(new Set(players).size, 4);
    for (const name of players) appearances.set(name, appearances.get(name) + 1);
    for (const team of [round.matches[0].teamA, round.matches[0].teamB]) {
      const [left, right] = team;
      partners.get(left).set(right, (partners.get(left).get(right) ?? 0) + 1);
      partners.get(right).set(left, (partners.get(right).get(left) ?? 0) + 1);
    }
  }
  assert.deepEqual([...appearances.values()], Array(count).fill(4));
  if (count > 4) {
    for (const playerPartners of partners.values()) {
      assert.equal(playerPartners.size, 4);
      assert.equal(Math.max(...playerPartners.values()), 1);
    }
  }
}
const first = generateRotationRound({
  names: ["A", "B", "C", "D", "E"],
  inactiveNames: [],
  mode: "DOUBLES",
  courtCount: 1,
  history: [],
  seed: "one",
});
assert.equal(first.matches.length, 1);
assert.equal(new Set([...first.matches[0].teamA, ...first.matches[0].teamB]).size, 4);
const second = generateRotationRound({
  names: ["A", "B", "C", "D", "E"],
  inactiveNames: [],
  mode: "DOUBLES",
  courtCount: 1,
  history: [first],
  seed: "two",
});
assert.equal(
  [...second.matches[0].teamA, ...second.matches[0].teamB].includes(first.waiting[0]),
  true,
);
const withRest = generateRotationRound({
  names: ["A", "B", "C", "D", "E"],
  inactiveNames: ["A"],
  mode: "DOUBLES",
  courtCount: 1,
  history: [],
  seed: "rest",
});
assert.equal(
  withRest.matches.flatMap((match) => [...match.teamA, ...match.teamB]).includes("A"),
  false,
);
const singlesHistory = [
  {
    number: 1,
    matches: [
      { court: 1, teamA: ["A"], teamB: ["B"] },
      { court: 2, teamA: ["C"], teamB: ["D"] },
    ],
    waiting: [],
  },
];
const singlesNext = generateRotationRound({
  names: ["A", "B", "C", "D"],
  inactiveNames: [],
  mode: "SINGLES",
  courtCount: 2,
  history: singlesHistory,
  seed: "avoid-repeat",
});
const latestPairs = new Set(["A/B", "C/D"]);
assert.equal(
  singlesNext.matches.some((match) =>
    latestPairs.has([match.teamA[0], match.teamB[0]].sort().join("/")),
  ),
  false,
);
assert.equal(parseMoneyToCents("12.30"), 1230);
assert.equal(parseMoneyToCents("12.345"), null);
assert.equal(formatCents(1230), "12.30");
const settlement = settleExpenses(
  ["A", "B", "C"],
  [
    { label: "场地", amountText: "90", payer: "A" },
    { label: "球", amountText: "30", payer: "B" },
  ],
);
assert.equal(settlement.totalCents, 12000);
assert.equal(settlement.transfers.length, 2);
assert.equal(
  settlement.members.reduce((sum, item) => sum + item.balanceCents, 0),
  0,
);
const remaining = new Map(settlement.members.map((item) => [item.name, item.balanceCents]));
for (const transfer of settlement.transfers) {
  remaining.set(transfer.from, (remaining.get(transfer.from) ?? 0) + transfer.amountCents);
  remaining.set(transfer.to, (remaining.get(transfer.to) ?? 0) - transfer.amountCents);
}
assert.equal(
  [...remaining.values()].every((balance) => balance === 0),
  true,
);
function bruteMinimum(balances) {
  const values = balances.filter(Boolean);
  const solve = (start) => {
    while (start < values.length && values[start] === 0) start += 1;
    if (start === values.length) return 0;
    let best = Number.POSITIVE_INFINITY;
    for (let index = start + 1; index < values.length; index += 1) {
      if (values[start] * values[index] >= 0) continue;
      values[index] += values[start];
      best = Math.min(best, 1 + solve(start + 1));
      values[index] -= values[start];
    }
    return best;
  };
  return solve(0);
}
for (let count = 3; count <= 7; count += 1) {
  const people = Array.from({ length: count }, (_, index) => `P${index + 1}`);
  const expenses = people.map((payer, index) => ({
    label: `E${index}`,
    amountText: `${index + 1}.00`,
    payer,
  }));
  const result = settleExpenses(people, expenses);
  assert.equal(
    result.transfers.length,
    bruteMinimum(result.members.map((item) => item.balanceCents)),
  );
}
const twenty = Array.from({ length: 20 }, (_, index) => `U${index + 1}`);
const startedAt = Date.now();
settleExpenses(
  twenty,
  twenty.map((payer, index) => ({
    label: `费用${index + 1}`,
    amountText: `${index + 1}.00`,
    payer,
  })),
);
assert.ok(Date.now() - startedAt < 1000, "20人结算应在1秒内完成");
const now = Date.now();
assert.equal(isFreshToolDraft({ schemaVersion: 1, updatedAt: now, data: {} }, now), true);
assert.equal(
  isFreshToolDraft({ schemaVersion: 1, updatedAt: now - 8 * 86400000, data: {} }, now),
  false,
);
// Seeded shuffling must preserve entries without depending on their names.
const original = ["A", "B", "C", "D"];
const permutation = shuffled(original, "regression");
assert.deepEqual([...permutation].sort(), original);
assert.deepEqual(shuffled(original, "regression"), permutation);
assert.deepEqual(original, ["A", "B", "C", "D"]);
assert.deepEqual(
  shuffled([0, 1, 2, 3], "regression").map((index) => original[index]),
  permutation,
);
const truncatedHistory = Array.from({ length: 50 }, (_, index) => ({
  ...singlesHistory[0],
  number: index + 12,
}));
assert.equal(
  generateRotationRound({
    names: original,
    inactiveNames: [],
    mode: "SINGLES",
    courtCount: 2,
    history: truncatedHistory,
    seed: "number",
  }).number,
  62,
);
assert.equal(
  generateRotationRound({
    names: original,
    inactiveNames: [],
    mode: "SINGLES",
    courtCount: 2,
    history: truncatedHistory.slice(0, -1),
    seed: "undo",
  }).number,
  61,
);
assert.deepEqual(visibleToolIds(["grouping", "scoring", "rotation", "draw", "expense", "rules"]), [
  "rotation",
  "scoring",
  "expense",
  "rules",
]);
assert.deepEqual(expandVisibleToolOrder(["scoring", "rotation", "rules", "expense"]), [
  "scoring",
  "grouping",
  "rotation",
  "draw",
  "rules",
  "expense",
]);
const removedDraftKeys = [];
globalThis.wx = {
  removeStorageSync(key) {
    removedDraftKeys.push(key);
  },
};
assert.equal(clearAllToolDrafts(), true);
assert.deepEqual(removedDraftKeys, [
  "yulai:tool:scoring:v1",
  "yulai:tool:rotation:v1",
  "yulai:tool:draw:v1",
  "yulai:tool:expense:v1",
]);
console.log("Tool domain behavior verified");
