import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const path = process.argv[2];
if (!path) throw new Error("Usage: node scripts/apply-nosql-commands.mjs <commands.json>");
const command = await readFile(path, "utf8");
JSON.parse(command);

const tcbCli = resolve("node_modules", "@cloudbase", "cli", "bin", "tcb");
const result = spawnSync(
  process.execPath,
  [tcbCli, "db", "nosql", "execute", "--command", command, "--json"],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  },
);
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
