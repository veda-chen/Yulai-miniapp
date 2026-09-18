import {
  appearanceView,
  applyNativeAppearance,
  DEFAULT_APPEARANCE,
  loadAppearanceState,
  normalizeAppearance,
} from "./utils/appearance";
import { callCloud } from "./services/cloud-api";
import { saveAppearanceState } from "./utils/appearance";

if (!wx.cloud) {
  throw new Error("当前微信基础库不支持云开发");
}

wx.cloud.init({
  env: "cloud1-d1g8z3590d3768cbb",
  traceUser: true,
});

App({
  globalData: {
    cloudFunctionName: "api",
  },
  async onLaunch() {
    const initial = loadAppearanceState();
    applyNativeAppearance(initial.preferences);
    if (initial.preferences.syncEnabled && initial.syncUserId) {
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
          applyNativeAppearance(preferences);
        } else if (initial.pendingSync) {
          const result = await callCloud<{ version: number }>("appearance.save", {
            preferences: initial.preferences,
            baseVersion: initial.serverVersion,
          });
          saveAppearanceState({ ...initial, serverVersion: result.version, pendingSync: false });
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
            applyNativeAppearance(preferences);
          }
        }
      } catch {}
    }
    wx.onThemeChange(() => {
      const state = loadAppearanceState();
      applyNativeAppearance(state.preferences);
      const pages = getCurrentPages();
      const current = pages[pages.length - 1];
      if (current) current.setData(appearanceView(state.preferences));
    });
  },
});
