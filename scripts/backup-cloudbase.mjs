import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

function parseEnv(text) {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        return separator < 0 ? [line, ""] : [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

async function loadEnvironment() {
  let fileValues = {};
  try {
    fileValues = parseEnv(await readFile(".env", "utf8"));
  } catch {}
  return { ...fileValues, ...process.env };
}

const tcbEntrypoint = resolve("node_modules/@cloudbase/cli/bin/tcb");

function runTcb(args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [tcbEntrypoint, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
      process.stderr.write(chunk);
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolvePromise({ empty: false });
      else if (/记录条数为0|zero records/i.test(output)) resolvePromise({ empty: true });
      else reject(new Error(`CloudBase CLI exited with code ${code ?? "unknown"}`));
    });
  });
}

const options = process.argv.slice(2);
const dryRun = options.includes("--dry-run");
const outputIndex = options.indexOf("--output");
const envId = (await loadEnvironment()).CLOUDBASE_ENV_ID;
if (!envId || envId.startsWith("replace-"))
  throw new Error("缺少有效的 CLOUDBASE_ENV_ID，请先配置 .env 或当前环境变量");

const definition = JSON.parse(await readFile("cloudbase/collections.json", "utf8"));
const collectionNames = definition.collections.map((item) => item.name);
if (
  !collectionNames.length ||
  collectionNames.some((name) => !/^[A-Za-z][A-Za-z0-9_]*$/.test(name))
)
  throw new Error("集合定义无效");

const backupId = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const outputDir = resolve(
  outputIndex >= 0 && options[outputIndex + 1] ? options[outputIndex + 1] : `.backups/${backupId}`,
);
console.log(`CloudBase backup plan: ${collectionNames.length} collections -> ${outputDir}`);
if (dryRun) {
  for (const collection of collectionNames) console.log(`- ${collection}`);
  process.exit(0);
}

await mkdir(outputDir, { recursive: true });
const collections = [];
for (const collection of collectionNames) {
  console.log(`Exporting ${collection}...`);
  const result = await runTcb([
    "db",
    "nosql",
    "dump",
    collection,
    "--file-type",
    "json",
    "--output-dir",
    outputDir,
    "-e",
    envId,
  ]);
  if (result.empty) {
    const marker = { collection, recordCount: 0, exportedAt: new Date().toISOString() };
    await writeFile(
      resolve(outputDir, `EMPTY-${collection}.json`),
      `${JSON.stringify(marker, null, 2)}\n`,
      "utf8",
    );
    collections.push({ name: collection, status: "EMPTY" });
    console.log(`Collection ${collection} is empty; marker created`);
  } else {
    collections.push({ name: collection, status: "EXPORTED" });
  }
}
const manifest = {
  version: 1,
  backupId,
  createdAt: new Date().toISOString(),
  environmentId: envId,
  schemaVersion: definition.version,
  collections,
};
await writeFile(
  resolve(outputDir, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);
console.log(`Backup completed: ${outputDir}`);
