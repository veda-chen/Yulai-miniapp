import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const [envId, ...collections] = process.argv.slice(2);
if (!envId || collections.length === 0) {
  throw new Error("Usage: node scripts/set-collection-acl.mjs <envId> <collection...>");
}
const tcbCli = resolve("node_modules", "@cloudbase", "cli", "bin", "tcb");

for (const collection of collections) {
  const body = JSON.stringify({ EnvId: envId, CollectionName: collection, AclTag: "ADMINONLY" });
  const result = spawnSync(
    process.execPath,
    [
      tcbCli,
      "api",
      "tcb",
      "ModifySafeRule",
      "--api-version",
      "2018-06-08",
      "--body",
      body,
      "--json",
    ],
    { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  process.stdout.write(`${collection}: ${result.stdout ?? ""}`);
  process.stderr.write(result.stderr ?? "");
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
