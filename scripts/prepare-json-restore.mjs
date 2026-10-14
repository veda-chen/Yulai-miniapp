import { readFile, readdir } from "node:fs/promises";
import { basename, resolve } from "node:path";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const backup = argument("--backup");
const targetEnvironment = argument("--target-env");
if (!backup || !targetEnvironment || !/^[A-Za-z0-9-]{8,80}$/.test(targetEnvironment)) {
  throw new Error("请指定 --backup <备份目录> --target-env <隔离环境ID>");
}
const directory = resolve(backup);
const manifest = JSON.parse(await readFile(resolve(directory, "manifest.json"), "utf8"));
if (manifest.environmentId === targetEnvironment) {
  throw new Error("隔离恢复目标不能与备份来源环境相同");
}
const files = await readdir(directory);
const definitions = JSON.parse(await readFile("cloudbase/collections.json", "utf8"));
const known = new Set(definitions.collections.map((item) => item.name));
const suffix = new Date().toISOString().replaceAll(/\D/g, "").slice(0, 14);
const rows = [];
for (const collection of manifest.collections) {
  if (!known.has(collection.name)) throw new Error(`未知备份集合：${collection.name}`);
  const exportFile = files.find(
    (name) =>
      name.startsWith("database_export-") &&
      name.includes(`-${collection.name}-`) &&
      name.endsWith(".json"),
  );
  const emptyMarker = `EMPTY-${collection.name}.json`;
  if (collection.status === "EXPORTED" && !exportFile)
    throw new Error(`缺少 ${collection.name} 的 JSON 导出文件`);
  if (collection.status === "EMPTY" && !files.includes(emptyMarker))
    throw new Error(`缺少 ${collection.name} 的空集合标记`);
  rows.push({
    source: collection.name,
    target: `${collection.name}_restored_${suffix}`,
    importFile: exportFile ? resolve(directory, exportFile) : null,
    empty: collection.status === "EMPTY",
  });
}
const missing = [...known].filter((name) => !rows.some((row) => row.source === name));
console.log(`备份 ${basename(directory)} → 隔离环境 ${targetEnvironment}`);
console.log(`来源环境 ${manifest.environmentId}；备份时间 ${manifest.createdAt}`);
for (const row of rows)
  console.log(
    `${row.source} → ${row.target}${row.empty ? "（空集合）" : `；导入 ${row.importFile}`}`,
  );
if (missing.length) console.warn(`当前定义中缺少备份的集合：${missing.join("、")}`);
console.log(
  "在隔离环境创建以上新集合，使用 CloudBase 控制台 JSON 导入对应文件；空集合只创建结构。随后核对记录数、关键关联、文件和环境配置，并记录恢复耗时。此脚本不执行导入。",
);
