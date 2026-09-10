import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const sampleCount = Number(process.argv[2] ?? 20);
const concurrency = Number(process.argv[3] ?? 5);
if (!Number.isInteger(sampleCount) || sampleCount < 5 || sampleCount > 100)
  throw new Error("sample count must be an integer from 5 to 100");
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 10)
  throw new Error("concurrency must be an integer from 1 to 10");
if (!process.env.CLOUDBASE_ENV_ID) throw new Error("CLOUDBASE_ENV_ID is required");

const tcbCli = resolve("node_modules", "@cloudbase", "cli", "bin", "tcb");
const actions = ["health.get", "activity.list"];

async function invoke(action, index) {
  const request = JSON.stringify({
    action,
    requestId: `perf-${action.replace(".", "-")}-${index}`,
  });
  const startedAt = performance.now();
  const { stdout } = await run(
    process.execPath,
    [tcbCli, "fn", "invoke", "api", "--params", request, "--json"],
    { cwd: process.cwd(), env: process.env, maxBuffer: 2 * 1024 * 1024 },
  );
  const wallMs = Math.round(performance.now() - startedAt);
  const response = JSON.parse(stdout);
  const functionData = response.data;
  const payload = JSON.parse(functionData.RetMsg);
  return {
    ok: payload.ok === true && functionData.InvokeResult === 0,
    durationMs: Number(functionData.Duration),
    wallMs,
  };
}

async function mapLimit(action) {
  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < sampleCount) {
      const index = cursor++;
      results[index] = await invoke(action, index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, sampleCount) }, () => worker()));
  return results;
}

function percentile(values, percent) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil((percent / 100) * sorted.length) - 1];
}

const report = {
  environmentId: process.env.CLOUDBASE_ENV_ID,
  measuredAt: new Date().toISOString(),
  sampleCount,
  concurrency,
  thresholdMs: 500,
  actions: {},
};

for (const action of actions) {
  const samples = await mapLimit(action);
  const durations = samples.map((sample) => sample.durationMs);
  const successes = samples.filter((sample) => sample.ok).length;
  report.actions[action] = {
    successes,
    errors: samples.length - successes,
    p50Ms: percentile(durations, 50),
    p95Ms: percentile(durations, 95),
    maxMs: Math.max(...durations),
    wallP95Ms: percentile(
      samples.map((sample) => sample.wallMs),
      95,
    ),
  };
}

report.passed = Object.values(report.actions).every(
  (result) => result.errors === 0 && result.p95Ms < report.thresholdMs,
);
await writeFile("release/m5-performance.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
