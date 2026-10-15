import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = await readFile("apps/miniprogram/app.ts", "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function loadApp(version, environments) {
  let app;
  const calls = [];
  const appearance = {
    DEFAULT_APPEARANCE: {},
    loadAppearanceState: () => ({ preferences: { syncEnabled: false } }),
    applyNativeAppearance: () => calls.push("appearance"),
  };
  runInNewContext(code, {
    exports: {},
    require: (name) => {
      if (name === "./config/cloud-env.generated") return { CLOUD_ENV_IDS: environments };
      if (name === "./utils/appearance") return appearance;
      if (name === "./services/cloud-api") return {};
      throw new Error(`Unexpected import: ${name}`);
    },
    App: (value) => {
      app = value;
    },
    wx: {
      cloud: { init: (options) => calls.push(options.env) },
      getAccountInfoSync: () => ({ miniProgram: { envVersion: version } }),
      onThemeChange: () => {},
    },
  });
  assert.ok(app, "App must register before lifecycle initialization");
  assert.deepEqual(calls, [], "Do not initialize cloud during module evaluation");
  return { app, calls };
}

const environments = { develop: "development-env", trial: "trial-env", release: "production-env" };
for (const version of Object.keys(environments)) {
  const { app, calls } = loadApp(version, environments);
  app.onLaunch();
  assert.deepEqual(calls, [environments[version], "appearance"]);
}
const missing = loadApp("release", { ...environments, release: "" });
assert.throws(() => missing.app.onLaunch(), /未配置release版本的云开发环境/);
assert.deepEqual(missing.calls, []);

const generatedPath = "apps/miniprogram/config/cloud-env.generated.ts";
const before = await readFile(generatedPath, "utf8");
for (const missingKey of ["TRIAL_CLOUDBASE_ENV_ID", "PRODUCTION_CLOUDBASE_ENV_ID"]) {
  const result = spawnSync(process.execPath, ["scripts/generate-cloud-env.mjs", "--for-upload"], {
    encoding: "utf8",
    env: {
      ...process.env,
      TRIAL_CLOUDBASE_ENV_ID: "trial-env",
      PRODUCTION_CLOUDBASE_ENV_ID: "production-env",
      [missingKey]: "",
    },
  });
  assert.notEqual(result.status, 0, `Upload must reject missing ${missingKey}`);
  assert.match(result.stderr, /禁止上传/);
  assert.equal(await readFile(generatedPath, "utf8"), before);
}
console.log("Cloud startup verified for develop, trial and release; incomplete uploads blocked");
