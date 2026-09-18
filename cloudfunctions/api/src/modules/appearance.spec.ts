import { describe, expect, it } from "vitest";
import { nextAppearanceVersion, parseAppearancePreferences } from "./appearance.js";

const valid = {
  schemaVersion: 2,
  brand: "blue",
  colorMode: "system",
  activityDensity: "compact",
  scoreTheme: "court",
  heroStyle: "gradient",
  cornerStyle: "compact",
  textSize: "large",
  showHero: false,
  moduleOrder: ["venues", "tools"],
  visibleModules: ["tools"],
  toolOrder: ["scoring", "grouping"],
  favoriteVenueIds: ["venue-1"],
  syncEnabled: true,
};

describe("parseAppearancePreferences", () => {
  it("accepts a complete supported configuration", () => {
    expect(parseAppearancePreferences(valid)).toEqual(valid);
  });

  it("migrates the first preference schema with safe defaults", () => {
    const { heroStyle: _hero, cornerStyle: _corner, textSize: _text, ...legacy } = valid;
    expect(parseAppearancePreferences({ ...legacy, schemaVersion: 1 })).toMatchObject({
      schemaVersion: 2,
      heroStyle: "photo",
      cornerStyle: "rounded",
      textSize: "standard",
    });
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
});

describe("nextAppearanceVersion", () => {
  it("increments a matching optimistic version", () => {
    expect(nextAppearanceVersion(3, 3)).toBe(4);
  });

  it("rejects a stale device version", () => {
    expect(() => nextAppearanceVersion(4, 3)).toThrow("其他设备已更新设置");
  });
});
