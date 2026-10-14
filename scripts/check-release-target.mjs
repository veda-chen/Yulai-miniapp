import { readFile } from "node:fs/promises";

let localValues = {};
try {
  const content = await readFile(".env", "utf8");
  localValues = Object.fromEntries(
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
} catch {
  // Required values are checked below.
}

const values = { ...localValues, ...process.env };
const packageInfo = JSON.parse(await readFile("package.json", "utf8"));
if (
  !values.PRODUCTION_CLOUDBASE_ENV_ID ||
  values.PRODUCTION_CLOUDBASE_ENV_ID !== values.CLOUDBASE_ENV_ID ||
  values.WECHAT_MINIPROGRAM_STATE !== "formal" ||
  !/^\d+\.\d+\.\d+$/.test(values.RELEASE_VERSION ?? "") ||
  values.RELEASE_VERSION !== packageInfo.version
) {
  throw new Error(
    "正式部署目标不一致：需设置相同的生产环境 ID、WECHAT_MINIPROGRAM_STATE=formal，且 RELEASE_VERSION 与 package.json 版本一致",
  );
}
console.log("正式部署目标已校验");
