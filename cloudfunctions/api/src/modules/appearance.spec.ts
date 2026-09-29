import { describe, expect, it } from "vitest";
import { nextAppearanceVersion, parseAppearancePreferences } from "./appearance.js";

const valid = {
  schemaVersion: 4,
  brand: "blue",
  colorMode: "system",
  activityDensity: "compact",
  scoreTheme: "court",
  heroStyle: "gradient",
  cornerStyle: "compact",
  textSize: "large",
  pageBackground: "court-lines",
  surfaceStyle: "outline",
  buttonStyle: "soft",
  sectionStyle: "numbered",
  iconStyle: "circle",
  motionMode: "reduced",
  showHero: false,
  moduleOrder: ["venues", "tools"],
  visibleModules: ["tools"],
  toolOrder: ["scoring", "grouping", "rotation", "draw", "expense", "rules"],
  homeToolIds: ["scoring", "rotation"],
  favoriteVenueIds: ["venue-1"],
  syncEnabled: true,
};

describe("parseAppearancePreferences", () => {
  it("accepts a complete supported configuration", () => {
    expect(parseAppearancePreferences(valid)).toEqual(valid);
  });

  it("migrates the first preference schema with safe defaults", () => {
    const {
      heroStyle: _hero,
      cornerStyle: _corner,
      textSize: _text,
      homeToolIds: _homeTools,
      ...legacy
    } = valid;
    expect(
      parseAppearancePreferences({
        ...legacy,
        schemaVersion: 1,
        toolOrder: ["grouping", "scoring"],
      }),
    ).toMatchObject({
      schemaVersion: 4,
      heroStyle: "photo",
      cornerStyle: "rounded",
      textSize: "standard",
      pageBackground: "soft-gradient",
      surfaceStyle: "elevated",
      buttonStyle: "filled",
      sectionStyle: "marker",
      iconStyle: "tile",
      motionMode: "subtle",
    });
  });

  it("migrates V2 and preserves V3 component fields from the current record", () => {
    const {
      pageBackground: _background,
      surfaceStyle: _surface,
      buttonStyle: _button,
      sectionStyle: _section,
      iconStyle: _icon,
      motionMode: _motion,
      homeToolIds: _homeTools,
      ...legacy
    } = valid;
    expect(
      parseAppearancePreferences(
        { ...legacy, schemaVersion: 2, toolOrder: ["scoring", "grouping"] },
        parseAppearancePreferences(valid),
      ),
    ).toMatchObject({
      schemaVersion: 4,
      pageBackground: "court-lines",
      surfaceStyle: "outline",
      buttonStyle: "soft",
      sectionStyle: "numbered",
      iconStyle: "circle",
      motionMode: "reduced",
    });
  });

  it("migrates V3 tool preferences and preserves V4 fields for old clients", () => {
    const { homeToolIds: _homeTools, ...legacy } = valid;
    const migrated = parseAppearancePreferences(
      { ...legacy, schemaVersion: 3, toolOrder: ["grouping", "scoring"] },
      parseAppearancePreferences(valid),
    );
    expect(migrated.toolOrder).toEqual([
      "grouping",
      "scoring",
      "rotation",
      "draw",
      "expense",
      "rules",
    ]);
    expect(migrated.homeToolIds).toEqual(valid.homeToolIds);
  });

  it("rejects unsupported V3 component options", () => {
    expect(() => parseAppearancePreferences({ ...valid, surfaceStyle: "glass" })).toThrow(
      "个性化设置包含不支持的选项",
    );
  });

  it("rejects duplicate module and tool order values", () => {
    expect(() => parseAppearancePreferences({ ...valid, moduleOrder: ["tools", "tools"] })).toThrow(
      "首页模块顺序无效",
    );
    expect(() =>
      parseAppearancePreferences({ ...valid, toolOrder: ["scoring", "scoring"] }),
    ).toThrow("工具顺序无效");
  });

  it("rejects more than three favorite venues", () => {
    expect(() =>
      parseAppearancePreferences({ ...valid, favoriteVenueIds: ["a", "b", "c", "d"] }),
    ).toThrow("常用场馆无效");
  });

  it("rejects more than four home tools", () => {
    expect(() =>
      parseAppearancePreferences({
        ...valid,
        homeToolIds: ["grouping", "scoring", "rotation", "draw", "expense"],
      }),
    ).toThrow("首页最多展示4项工具");
  });
});

describe("nextAppearanceVersion", () => {
  it("increments a matching optimistic version", () => {
    expect(nextAppearanceVersion(3, 3)).toBe(4);
  });

  it("rejects a stale device version", () => {
    expect(() => nextAppearanceVersion(4, 3)).toThrow("其他设备已更新设置");
  });
});
