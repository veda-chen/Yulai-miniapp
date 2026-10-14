import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const cli = require.resolve("@cloudbase/cli/bin/tcb");
const commands = JSON.parse(readFileSync("cloudbase/play-invitation-commands.json", "utf8"));
for (const command of commands) {
  execFileSync(
    process.execPath,
    [cli, "db", "nosql", "execute", "-c", JSON.stringify([command]), "--json"],
    {
      stdio: "inherit",
    },
  );
}
