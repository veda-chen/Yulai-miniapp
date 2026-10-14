import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

async function sha256(path) {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

async function artifactFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await artifactFiles(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

const root = resolve(import.meta.dirname, "..");
const outputDir = resolve(root, ".release-manifests");
const packageInfo = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const gates = JSON.parse(await readFile(join(root, "release/m5-gates.json"), "utf8"));
const functionDir = join(root, "cloudfunctions/api/dist");
const functionFiles = await artifactFiles(functionDir);
if (!functionFiles.length) throw new Error("云函数产物不存在，请先运行 pnpm build");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const commit = git("rev-parse", "HEAD");
const dirty = git("status", "--porcelain").length > 0;
const manifest = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  miniappVersion: packageInfo.version,
  gitCommit: commit,
  workingTreeDirty: dirty,
  cloudFunction: {
    name: "api",
    files: await Promise.all(
      functionFiles.map(async (path) => ({
        path: relative(root, path).replaceAll("\\", "/"),
        sha256: await sha256(path),
      })),
    ),
  },
  databaseDefinitionsSha256: await sha256(join(root, "cloudbase/collections.json")),
  indexChangeFiles: [
    "cloudbase/experience-index-commands.json",
    "cloudbase/optimization-index-commands.json",
    "cloudbase/file-cleanup-commands.json",
  ],
  acceptanceRecord: "docs/全面优化实施记录_2026-10-11.md",
  gateStatuses: Object.fromEntries(gates.gates.map((gate) => [gate.id, gate.status])),
};
await mkdir(outputDir, { recursive: true });
const path = join(outputDir, `${new Date().toISOString().replaceAll(/[:.]/g, "-")}.json`);
await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`发布映射清单已保存：${path}`);
if (dirty) console.warn("工作区仍有未提交改动；正式版本须使用确定的 Git 提交重新生成清单");
