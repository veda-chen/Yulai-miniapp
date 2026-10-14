export type BrandTheme = "blue" | "green" | "orange";
export type ColorMode = "light" | "dark" | "system";
export type ActivityDensity = "comfortable" | "compact";
export type ScoreTheme = "default" | "court";
export type HeroStyle = "photo" | "gradient";
export type CornerStyle = "rounded" | "compact";
export type TextSize = "standard" | "large";
export type PageBackground = "plain" | "soft-gradient" | "court-lines";
export type SurfaceStyle = "elevated" | "flat" | "outline";
export type ButtonStyle = "filled" | "soft" | "outline";
export type SectionStyle = "marker" | "numbered" | "plain";
export type IconStyle = "tile" | "circle" | "bare";
export type MotionMode = "subtle" | "reduced";
export type HomeModuleId = "tools" | "venues";
export type ToolId = "grouping" | "scoring" | "rotation" | "draw" | "expense" | "rules";
export type AppearancePresetId = "blue-active" | "green-court" | "orange-light";

export type AppearancePreferences = {
  schemaVersion: 4;
  brand: BrandTheme;
  colorMode: ColorMode;
  activityDensity: ActivityDensity;
  scoreTheme: ScoreTheme;
  heroStyle: HeroStyle;
  cornerStyle: CornerStyle;
  textSize: TextSize;
  pageBackground: PageBackground;
  surfaceStyle: SurfaceStyle;
  buttonStyle: ButtonStyle;
  sectionStyle: SectionStyle;
  iconStyle: IconStyle;
  motionMode: MotionMode;
  showHero: boolean;
  moduleOrder: HomeModuleId[];
  visibleModules: HomeModuleId[];
  toolOrder: ToolId[];
  homeToolIds: ToolId[];
  favoriteVenueIds: string[];
  syncEnabled: boolean;
};

export type AppearanceLocalState = {
  preferences: AppearancePreferences;
  serverVersion: number;
  pendingSync: boolean;
  syncUserId: string | null;
};

const STORAGE_KEY = "yulai:appearance:v1";
const MODULES: HomeModuleId[] = ["tools", "venues"];
const TOOLS: ToolId[] = ["grouping", "scoring", "rotation", "draw", "expense", "rules"];

export const DEFAULT_APPEARANCE: AppearancePreferences = {
  schemaVersion: 4,
  brand: "blue",
  colorMode: "light",
  activityDensity: "comfortable",
  scoreTheme: "default",
  heroStyle: "photo",
  cornerStyle: "rounded",
  textSize: "standard",
  pageBackground: "soft-gradient",
  surfaceStyle: "elevated",
  buttonStyle: "filled",
  sectionStyle: "marker",
  iconStyle: "tile",
  motionMode: "subtle",
  showHero: true,
  moduleOrder: [...MODULES],
  visibleModules: [],
  toolOrder: [...TOOLS],
  homeToolIds: ["grouping", "scoring"],
  favoriteVenueIds: [],
  syncEnabled: false,
};

const APPEARANCE_PRESETS: Record<
  AppearancePresetId,
  Pick<
    AppearancePreferences,
    | "brand"
    | "colorMode"
    | "heroStyle"
    | "activityDensity"
    | "cornerStyle"
    | "textSize"
    | "scoreTheme"
    | "pageBackground"
    | "surfaceStyle"
    | "buttonStyle"
    | "sectionStyle"
    | "iconStyle"
    | "motionMode"
  >
> = {
  "blue-active": {
    brand: "blue",
    colorMode: "light",
    heroStyle: "photo",
    activityDensity: "comfortable",
    cornerStyle: "rounded",
    textSize: "standard",
    scoreTheme: "default",
    pageBackground: "soft-gradient",
    surfaceStyle: "elevated",
    buttonStyle: "filled",
    sectionStyle: "marker",
    iconStyle: "tile",
    motionMode: "subtle",
  },
  "green-court": {
    brand: "green",
    colorMode: "light",
    heroStyle: "gradient",
    activityDensity: "comfortable",
    cornerStyle: "rounded",
    textSize: "standard",
    scoreTheme: "court",
    pageBackground: "court-lines",
    surfaceStyle: "outline",
    buttonStyle: "filled",
    sectionStyle: "numbered",
    iconStyle: "circle",
    motionMode: "subtle",
  },
  "orange-light": {
    brand: "orange",
    colorMode: "light",
    heroStyle: "gradient",
    activityDensity: "compact",
    cornerStyle: "compact",
    textSize: "standard",
    scoreTheme: "default",
    pageBackground: "plain",
    surfaceStyle: "flat",
    buttonStyle: "soft",
    sectionStyle: "plain",
    iconStyle: "bare",
    motionMode: "subtle",
  },
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function enumValue<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === "string" && values.includes(value as T) ? (value as T) : fallback;
}

function orderedValues<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  const selected = Array.isArray(value)
    ? value.filter((item): item is T => typeof item === "string" && allowed.includes(item as T))
    : [];
  return [...new Set(selected), ...allowed.filter((item) => !selected.includes(item))];
}

export function normalizeAppearance(value: unknown): AppearancePreferences {
  const source = record(value) ? value : {};
  const sourceVersion = typeof source.schemaVersion === "number" ? source.schemaVersion : 1;
  const visible = Array.isArray(source.visibleModules)
    ? source.visibleModules.filter(
        (item): item is HomeModuleId =>
          typeof item === "string" && MODULES.includes(item as HomeModuleId),
      )
    : [];
  const favorites = Array.isArray(source.favoriteVenueIds)
    ? source.favoriteVenueIds.filter(
        (item): item is string => typeof item === "string" && item.length > 0 && item.length <= 64,
      )
    : [];
  return {
    schemaVersion: 4,
    brand: enumValue(source.brand, ["blue", "green", "orange"], "blue"),
    colorMode: enumValue(source.colorMode, ["light", "dark", "system"], "light"),
    activityDensity: enumValue(source.activityDensity, ["comfortable", "compact"], "comfortable"),
    scoreTheme: enumValue(source.scoreTheme, ["default", "court"], "default"),
    heroStyle: enumValue(source.heroStyle, ["photo", "gradient"], "photo"),
    cornerStyle: enumValue(source.cornerStyle, ["rounded", "compact"], "rounded"),
    textSize: enumValue(source.textSize, ["standard", "large"], "standard"),
    pageBackground: enumValue(
      source.pageBackground,
      ["plain", "soft-gradient", "court-lines"],
      "soft-gradient",
    ),
    surfaceStyle: enumValue(source.surfaceStyle, ["elevated", "flat", "outline"], "elevated"),
    buttonStyle: enumValue(source.buttonStyle, ["filled", "soft", "outline"], "filled"),
    sectionStyle: enumValue(source.sectionStyle, ["marker", "numbered", "plain"], "marker"),
    iconStyle: enumValue(source.iconStyle, ["tile", "circle", "bare"], "tile"),
    motionMode: enumValue(source.motionMode, ["subtle", "reduced"], "subtle"),
    showHero: typeof source.showHero === "boolean" ? source.showHero : true,
    moduleOrder: orderedValues(source.moduleOrder, MODULES),
    visibleModules: [...new Set(visible)],
    toolOrder: orderedValues(source.toolOrder, TOOLS),
    homeToolIds: [
      ...new Set(
        (Array.isArray(source.homeToolIds)
          ? source.homeToolIds
          : sourceVersion < 4 && Array.isArray(source.toolOrder)
            ? source.toolOrder
            : ["grouping", "scoring"]
        ).filter(
          (item): item is ToolId => typeof item === "string" && TOOLS.includes(item as ToolId),
        ),
      ),
    ].slice(0, 4),
    favoriteVenueIds: [...new Set(favorites)].slice(0, 3),
    syncEnabled: source.syncEnabled === true,
  };
}

export function applyAppearancePreset(
  current: AppearancePreferences,
  presetId: AppearancePresetId,
): AppearancePreferences {
  return normalizeAppearance({ ...current, ...APPEARANCE_PRESETS[presetId] });
}

export function matchingAppearancePreset(
  preferences: AppearancePreferences,
): AppearancePresetId | null {
  for (const presetId of Object.keys(APPEARANCE_PRESETS) as AppearancePresetId[]) {
    const preset = APPEARANCE_PRESETS[presetId];
    if (
      Object.entries(preset).every(
        ([field, value]) => preferences[field as keyof AppearancePreferences] === value,
      )
    )
      return presetId;
  }
  return null;
}

export function loadAppearanceState(): AppearanceLocalState {
  try {
    const stored = wx.getStorageSync(STORAGE_KEY) as unknown;
    if (!record(stored)) {
      return {
        preferences: { ...DEFAULT_APPEARANCE },
        serverVersion: 0,
        pendingSync: false,
        syncUserId: null,
      };
    }
    return {
      preferences: normalizeAppearance(stored.preferences),
      serverVersion:
        typeof stored.serverVersion === "number" && stored.serverVersion >= 0
          ? Math.floor(stored.serverVersion)
          : 0,
      pendingSync: stored.pendingSync === true,
      syncUserId: typeof stored.syncUserId === "string" ? stored.syncUserId : null,
    };
  } catch {
    return {
      preferences: { ...DEFAULT_APPEARANCE },
      serverVersion: 0,
      pendingSync: false,
      syncUserId: null,
    };
  }
}

export function saveAppearanceState(state: AppearanceLocalState): AppearanceLocalState {
  const normalized = {
    preferences: normalizeAppearance(state.preferences),
    serverVersion: Math.max(0, Math.floor(state.serverVersion)),
    pendingSync: state.pendingSync,
    syncUserId: state.syncUserId,
  };
  wx.setStorageSync(STORAGE_KEY, normalized);
  return normalized;
}

export function clearAppearanceState() {
  wx.removeStorageSync(STORAGE_KEY);
}

export function resolvedMode(preferences: AppearancePreferences): "light" | "dark" {
  if (preferences.colorMode !== "system") return preferences.colorMode;
  const info = wx.getSystemInfoSync() as WechatMiniprogram.SystemInfo & { theme?: string };
  return info.theme === "dark" ? "dark" : "light";
}

export function appearanceView(preferences = loadAppearanceState().preferences) {
  const mode = resolvedMode(preferences);
  return {
    appearance: preferences,
    appearanceClass: [
      `theme-${preferences.brand}`,
      `mode-${mode}`,
      `corner-${preferences.cornerStyle}`,
      `text-${preferences.textSize}`,
      `background-${preferences.pageBackground}`,
      `surface-${preferences.surfaceStyle}`,
      `button-${preferences.buttonStyle}`,
      `section-${preferences.sectionStyle}`,
      `icon-${preferences.iconStyle}`,
      `motion-${preferences.motionMode}`,
    ].join(" "),
    isDark: mode === "dark",
    primaryColor:
      preferences.brand === "green"
        ? "#11866f"
        : preferences.brand === "orange"
          ? "#d65f27"
          : "#007aff",
  };
}

export function applyNativeAppearance(preferences = loadAppearanceState().preferences) {
  const mode = resolvedMode(preferences);
  const dark = mode === "dark";
  const primary =
    preferences.brand === "green"
      ? "#11866f"
      : preferences.brand === "orange"
        ? "#d65f27"
        : "#007aff";
  wx.setNavigationBarColor({
    frontColor: dark ? "#ffffff" : "#000000",
    backgroundColor: dark ? "#15171a" : "#ffffff",
  });
  wx.setTabBarStyle({
    color: dark ? "#9a9da3" : "#8e8e93",
    selectedColor: primary,
    backgroundColor: dark ? "#15171a" : "#ffffff",
    borderStyle: dark ? "white" : "black",
  });
}
