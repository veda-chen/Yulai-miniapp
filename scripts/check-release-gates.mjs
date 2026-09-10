import { readFile } from "node:fs/promises";

const checklist = JSON.parse(await readFile("release/m5-gates.json", "utf8"));
const allowed = new Set(["PENDING", "PASSED", "BLOCKED"]);
const invalid = checklist.gates.filter((gate) => !allowed.has(gate.status));
if (invalid.length)
  throw new Error(`发布门槛包含无效状态：${invalid.map((gate) => gate.id).join("、")}`);

const incomplete = checklist.gates.filter(
  (gate) => gate.status !== "PASSED" || typeof gate.evidence !== "string" || !gate.evidence.trim(),
);
if (incomplete.length) {
  console.error("M5 尚未达到可发布状态：");
  for (const gate of incomplete) console.error(`- ${gate.id}: ${gate.status}（${gate.owner}）`);
  console.error("请完成核验，并在 release/m5-gates.json 中记录 PASSED 状态与证据。");
  process.exitCode = 1;
} else console.log("M5 release gates passed");
