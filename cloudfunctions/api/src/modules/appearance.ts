import { db } from "../db.js";
import { AppError } from "../errors.js";
import type { Handler } from "../types.js";
import { findCurrentUser } from "./user.js";

type AppearancePreferences = {
  schemaVersion: 2;
  brand: "blue" | "green" | "orange";
  colorMode: "light" | "dark" | "system";
  activityDensity: "comfortable" | "compact";
  scoreTheme: "default" | "court";
  heroStyle: "photo" | "gradient";
  cornerStyle: "rounded" | "compact";
  textSize: "standard" | "large";
  showHero: boolean;
  moduleOrder: Array<"tools" | "venues">;
  visibleModules: Array<"tools" | "venues">;
  toolOrder: Array<"grouping" | "scoring">;
  favoriteVenueIds: string[];
  syncEnabled: boolean;
};

type AppearanceDocument = AppearancePreferences & {
  _id: string;
  userId: string;
  version: number;
};

const ENUMS = {
  brand: ["blue", "green", "orange"],
  colorMode: ["light", "dark", "system"],
  activityDensity: ["comfortable", "compact"],
  scoreTheme: ["default", "court"],
  heroStyle: ["photo", "gradient"],
  cornerStyle: ["rounded", "compact"],
  textSize: ["standard", "large"],
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactOrder<T extends string>(value: unknown, allowed: readonly T[], label: string): T[] {
  if (!Array.isArray(value) || value.length !== allowed.length) {
    throw new AppError("INVALID_ARGUMENT", `${label}无效`);
  }
  const values = value.filter((item): item is T => typeof item === "string");
  if (values.length !== allowed.length || new Set(values).size !== allowed.length) {
    throw new AppError("INVALID_ARGUMENT", `${label}无效`);
  }
  if (values.some((item) => !allowed.includes(item))) {
    throw new AppError("INVALID_ARGUMENT", `${label}无效`);
  }
  return values;
}

function selection<T extends string>(value: unknown, allowed: readonly T[], label: string): T[] {
  if (!Array.isArray(value)) throw new AppError("INVALID_ARGUMENT", `${label}无效`);
  const values = value.filter((item): item is T => typeof item === "string");
  if (values.length !== value.length || new Set(values).size !== values.length) {
    throw new AppError("INVALID_ARGUMENT", `${label}无效`);
  }
  if (values.some((item) => !allowed.includes(item))) {
    throw new AppError("INVALID_ARGUMENT", `${label}无效`);
  }
  return values;
}

export function parseAppearancePreferences(value: unknown): AppearancePreferences {
  if (!isRecord(value)) throw new AppError("INVALID_ARGUMENT", "个性化设置无效");
  const source =
    value.schemaVersion === 1
      ? {
          ...value,
          schemaVersion: 2,
          heroStyle: "photo",
          cornerStyle: "rounded",
          textSize: "standard",
        }
      : value;
  for (const [field, options] of Object.entries(ENUMS)) {
    if (typeof source[field] !== "string" || !options.includes(source[field] as never)) {
      throw new AppError("INVALID_ARGUMENT", "个性化设置包含不支持的选项");
    }
  }
  if (source.schemaVersion !== 2 || typeof source.showHero !== "boolean") {
    throw new AppError("INVALID_ARGUMENT", "个性化设置版本无效");
  }
  if (typeof source.syncEnabled !== "boolean") {
    throw new AppError("INVALID_ARGUMENT", "同步设置无效");
  }
  if (!Array.isArray(source.favoriteVenueIds)) {
    throw new AppError("INVALID_ARGUMENT", "常用场馆无效");
  }
  const favoriteVenueIds = source.favoriteVenueIds.filter(
    (item): item is string => typeof item === "string",
  );
  if (
    favoriteVenueIds.length !== source.favoriteVenueIds.length ||
    new Set(favoriteVenueIds).size !== favoriteVenueIds.length ||
    favoriteVenueIds.length > 3 ||
    favoriteVenueIds.some((id) => id.length < 1 || id.length > 64)
  ) {
    throw new AppError("INVALID_ARGUMENT", "常用场馆无效");
  }
  return {
    schemaVersion: 2,
    brand: source.brand as AppearancePreferences["brand"],
    colorMode: source.colorMode as AppearancePreferences["colorMode"],
    activityDensity: source.activityDensity as AppearancePreferences["activityDensity"],
    scoreTheme: source.scoreTheme as AppearancePreferences["scoreTheme"],
    heroStyle: source.heroStyle as AppearancePreferences["heroStyle"],
    cornerStyle: source.cornerStyle as AppearancePreferences["cornerStyle"],
    textSize: source.textSize as AppearancePreferences["textSize"],
    showHero: source.showHero,
    moduleOrder: exactOrder(source.moduleOrder, ["tools", "venues"], "首页模块顺序"),
    visibleModules: selection(source.visibleModules, ["tools", "venues"], "首页模块"),
    toolOrder: exactOrder(source.toolOrder, ["grouping", "scoring"], "工具顺序"),
    favoriteVenueIds,
    syncEnabled: source.syncEnabled,
  };
}

function publicDocument(document: AppearanceDocument) {
  return { preferences: parseAppearancePreferences(document), version: document.version };
}

export function nextAppearanceVersion(currentVersion: number, baseVersion: number): number {
  if (currentVersion !== baseVersion) {
    throw new AppError("APPEARANCE_VERSION_CONFLICT", "其他设备已更新设置，请选择要保留的版本");
  }
  return currentVersion + 1;
}

export const getAppearance: Handler = async (_payload, context) => {
  const user = await findCurrentUser(context);
  try {
    const result = (await db
      .collection("appearancePreferences")
      .doc(user._id)
      .get()) as unknown as {
      data: AppearanceDocument;
    };
    return publicDocument(result.data);
  } catch {
    return { preferences: null, version: 0 };
  }
};

export const saveAppearance: Handler = async (payload, context) => {
  if (!isRecord(payload) || typeof payload.baseVersion !== "number") {
    throw new AppError("INVALID_ARGUMENT", "同步版本无效");
  }
  const preferences = parseAppearancePreferences(payload.preferences);
  const baseVersion = Math.floor(payload.baseVersion);
  if (baseVersion < 0) throw new AppError("INVALID_ARGUMENT", "同步版本无效");
  const user = await findCurrentUser(context);

  return db.runTransaction(async (transaction: Pick<typeof db, "collection">) => {
    const reference = transaction.collection("appearancePreferences").doc(user._id);
    let current: AppearanceDocument | null = null;
    try {
      const result = (await reference.get()) as unknown as { data: AppearanceDocument };
      current = result.data;
    } catch {}
    const currentVersion = current?.version ?? 0;
    const version = nextAppearanceVersion(currentVersion, baseVersion);
    const data = {
      ...preferences,
      userId: user._id,
      version,
      updatedAt: db.serverDate(),
    };
    if (current) await reference.update({ data });
    else await reference.set({ data: { ...data, createdAt: db.serverDate() } });
    return { preferences, version };
  });
};
