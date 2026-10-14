import {
  appearanceView,
  applyNativeAppearance,
  DEFAULT_APPEARANCE,
  loadAppearanceState,
  normalizeAppearance,
} from "./utils/appearance";
import { callCloud } from "./services/cloud-api";
import { saveAppearanceState } from "./utils/appearance";
import { CLOUD_ENV_IDS } from "./config/cloud-env.generated";

if (!wx.cloud) {
  throw new Error("当前微信基础库不支持云开发");
}

const environment = wx.getAccountInfoSync().miniProgram.envVersion;
const cloudEnvironment = CLOUD_ENV_IDS[environment];
if (!cloudEnvironment) throw new Error(`未配置${environment}版本的云开发环境`);
wx.cloud.init({
  env: cloudEnvironment,
  traceUser: true,
});

function refreshVisibleAppearance(preferences: typeof DEFAULT_APPEARANCE) {
  applyNativeAppearance(preferences);
  const pages = getCurrentPages();
  const current = pages[pages.length - 1] as
    | (WechatMiniprogram.Page.Instance<Record<string, unknown>, Record<string, unknown>> & {
        onAppearanceSynced?: (value: typeof DEFAULT_APPEARANCE) => void;
      })
    | undefined;
  if (!current) return;
  if (typeof current.onAppearanceSynced === "function") current.onAppearanceSynced(preferences);
  else current.setData(appearanceView(preferences));
}

let appearanceSync: Promise<void> | null = null;

async function syncAppearance() {
  const initial = loadAppearanceState();
  if (!initial.preferences.syncEnabled || !initial.syncUserId) return;
  try {
    const session = await callCloud<{ user: { id: string } }>("auth.session");
    if (session.user.id !== initial.syncUserId) {
      const remote = await callCloud<{
        preferences: typeof initial.preferences | null;
        version: number;
      }>("appearance.get");
      const preferences = remote.preferences
        ? normalizeAppearance({ ...remote.preferences, syncEnabled: true })
        : { ...DEFAULT_APPEARANCE };
      saveAppearanceState({
        preferences,
        serverVersion: remote.version,
        pendingSync: false,
        syncUserId: remote.preferences ? session.user.id : null,
      });
      refreshVisibleAppearance(preferences);
    } else if (initial.pendingSync) {
      const result = await callCloud<{ version: number }>("appearance.save", {
        preferences: initial.preferences,
        baseVersion: initial.serverVersion,
      });
      saveAppearanceState({ ...initial, serverVersion: result.version, pendingSync: false });
      refreshVisibleAppearance(initial.preferences);
    } else {
      const remote = await callCloud<{
        preferences: typeof initial.preferences | null;
        version: number;
      }>("appearance.get");
      if (remote.preferences && remote.version > initial.serverVersion) {
        const preferences = normalizeAppearance({ ...remote.preferences, syncEnabled: true });
        saveAppearanceState({
          preferences,
          serverVersion: remote.version,
          pendingSync: false,
          syncUserId: initial.syncUserId,
        });
        refreshVisibleAppearance(preferences);
      }
    }
  } catch {}
}

function scheduleAppearanceSync() {
  if (appearanceSync) return;
  appearanceSync = syncAppearance().finally(() => {
    appearanceSync = null;
  });
}

App({
  globalData: {
    cloudFunctionName: "api",
  },
  onLaunch() {
    const initial = loadAppearanceState();
    applyNativeAppearance(initial.preferences);
    scheduleAppearanceSync();
    wx.onThemeChange(() => {
      const state = loadAppearanceState();
      applyNativeAppearance(state.preferences);
      const pages = getCurrentPages();
      const current = pages[pages.length - 1];
      if (current) current.setData(appearanceView(state.preferences));
    });
  },
  onShow() {
    scheduleAppearanceSync();
  },
});
