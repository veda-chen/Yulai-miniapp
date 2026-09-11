import { readFile } from "node:fs/promises";

function readDotEnv(text) {
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

let fileValues = {};
try {
  fileValues = readDotEnv(await readFile(".env", "utf8"));
} catch {
  // A missing .env is reported below with the missing variables.
}

const values = { ...fileValues, ...process.env };
const missing = [];
if (!values.CLOUDBASE_ENV_ID || values.CLOUDBASE_ENV_ID.startsWith("replace-")) {
  missing.push("CLOUDBASE_ENV_ID");
}
if (!values.OPENID_HASH_SECRET || values.OPENID_HASH_SECRET.length < 32) {
  missing.push("OPENID_HASH_SECRET（至少32字符）");
}
if (!values.SUBSCRIPTION_OPENID_KEY || values.SUBSCRIPTION_OPENID_KEY.length < 32) {
  missing.push("SUBSCRIPTION_OPENID_KEY（至少32字符）");
}
if (!["developer", "trial", "formal"].includes(values.WECHAT_MINIPROGRAM_STATE)) {
  missing.push("WECHAT_MINIPROGRAM_STATE（developer、trial或formal）");
}

if (missing.length) {
  console.error(`云开发环境尚未就绪，缺少：${missing.join("、")}`);
  process.exitCode = 1;
} else {
  console.log(`CloudBase environment ready: ${values.CLOUDBASE_ENV_ID}`);
}
