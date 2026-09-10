import { readFile } from "node:fs/promises";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
const restoreTime = argument("--time");
if (!restoreTime || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(restoreTime))
  throw new Error('请使用 --time "YYYY-MM-DD HH:mm:ss" 指定回档时间');

const definition = JSON.parse(await readFile("cloudbase/collections.json", "utf8"));
const requested = argument("--collections")
  ?.split(/[,\s]+/)
  .filter(Boolean);
const known = new Set(definition.collections.map((item) => item.name));
const collections = requested?.length ? requested : [...known];
for (const collection of collections)
  if (!known.has(collection)) throw new Error(`未知集合：${collection}`);

const suffix = restoreTime.replace(/\D/g, "");
const mappings = collections.map((name) => ({
  OldTableName: name,
  NewTableName: `${name}_restored_${suffix}`,
}));
console.log("恢复演练始终写入新集合，核验完成前不要覆盖原集合。");
console.log("1. tcb db nosql restore-time -e <env-id>");
console.log(`2. tcb db nosql restore-tables --time "${restoreTime}" -e <env-id>`);
console.log(
  `3. tcb db nosql restore --time "${restoreTime}" --tables '${JSON.stringify(mappings)}' -e <env-id>`,
);
console.log("4. tcb db nosql restore-task -e <env-id>");
