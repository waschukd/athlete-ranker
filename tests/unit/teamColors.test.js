import { describe, it, expect } from "vitest";
import {
  DEFAULT_TEAM_COLORS,
  PRESET_TEAM_COLORS,
  UNKNOWN_TEAM_COLOR,
  parseTeamColors,
  colorFor,
  swatchStyle,
  nextColor,
  colorInitial,
  colorNames,
} from "@/lib/teamColors";

// This module must never break how sessions created BEFORE the White/Dark ->
// Red/Blue default switch render -- every one of those rows is "White" or
// "Dark" and every checkin_session from that era holds the literal
// ["White","Dark"], so those legacy cases are asserted hardest. Going forward,
// White/Dark are no longer offered or defaulted to anywhere (evaluators found
// them too hard to differentiate), so DEFAULT_TEAM_COLORS/PRESET_TEAM_COLORS
// are asserted against Red/Blue instead.

describe("parseTeamColors — legacy shapes", () => {
  it("upgrades the legacy [\"White\",\"Dark\"] array to full entries", () => {
    const out = parseTeamColors(["White", "Dark"]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ name: "White", hex: "#ffffff", text: "#111827" });
    expect(out[1]).toMatchObject({ name: "Dark", hex: "#111827", text: "#ffffff" });
  });

  it("parses the JSON string Postgres can hand back", () => {
    expect(parseTeamColors('["White", "Dark"]')).toEqual(parseTeamColors(["White", "Dark"]));
  });

  it("falls back to the default pair for null, empty, and malformed input", () => {
    expect(parseTeamColors(null)).toEqual(DEFAULT_TEAM_COLORS);
    expect(parseTeamColors([])).toEqual(DEFAULT_TEAM_COLORS);
    expect(parseTeamColors("not json")).toEqual(DEFAULT_TEAM_COLORS);
    expect(parseTeamColors(undefined)).toEqual(DEFAULT_TEAM_COLORS);
  });

  it("keeps full objects and backfills missing fields from the preset", () => {
    const out = parseTeamColors([{ name: "Red" }]);
    expect(out[0]).toMatchObject({ name: "Red", hex: "#dc2626", text: "#ffffff" });
  });

  it("prefers a stored hex over the preset", () => {
    const out = parseTeamColors([{ name: "Red", hex: "#ff0000" }]);
    expect(out[0].hex).toBe("#ff0000");
  });

  it("keeps an unrecognised colour name rather than dropping the team", () => {
    const out = parseTeamColors(["Chartreuse"]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Chartreuse");
  });
});

describe("colorFor — resolving a stored team_color", () => {
  const custom = parseTeamColors(["Red", "Blue"]);

  it("resolves against the session palette", () => {
    expect(colorFor("Red", custom).hex).toBe("#dc2626");
    expect(colorFor("Blue", custom).hex).toBe("#2563eb");
  });

  it("is case-insensitive", () => {
    expect(colorFor("red", custom).name).toBe("Red");
    expect(colorFor("DARK", DEFAULT_TEAM_COLORS).name).toBe("Dark");
  });

  it("still renders a legacy White/Dark row on a session with custom colours", () => {
    // The orphan case: colours were changed after players were checked in.
    expect(colorFor("White", custom).hex).toBe("#ffffff");
    expect(colorFor("Dark", custom).hex).toBe("#111827");
  });

  it("returns the neutral swatch for null/unknown rather than throwing", () => {
    expect(colorFor(null, custom)).toEqual(UNKNOWN_TEAM_COLOR);
    expect(colorFor("", custom)).toEqual(UNKNOWN_TEAM_COLOR);
    expect(colorFor("Chartreuse", custom)).toEqual(UNKNOWN_TEAM_COLOR);
  });

  it("defaults the palette when none is supplied", () => {
    expect(colorFor("White").hex).toBe("#ffffff");
    expect(colorFor("Dark", []).hex).toBe("#111827");
  });
});

describe("swatchStyle", () => {
  it("returns inline background/color/border so theme overrides cannot repaint it", () => {
    expect(swatchStyle(colorFor("White", DEFAULT_TEAM_COLORS))).toEqual({
      background: "#ffffff", color: "#111827", border: "2px solid #9ca3af",
    });
  });

  it("never returns undefined values for a missing entry", () => {
    const s = swatchStyle(null);
    expect(s.background).toBeTruthy();
    expect(s.color).toBeTruthy();
  });

  it("pairs dark ink with light jerseys and light ink with dark ones", () => {
    expect(swatchStyle(colorFor("Yellow", parseTeamColors(["Yellow"]))).color).toBe("#111827");
    expect(swatchStyle(colorFor("Blue", parseTeamColors(["Blue"]))).color).toBe("#ffffff");
  });
});

describe("nextColor — the tap-to-switch toggle", () => {
  it("flips between the two default colours", () => {
    expect(nextColor("Red", DEFAULT_TEAM_COLORS)).toBe("Blue");
    expect(nextColor("Blue", DEFAULT_TEAM_COLORS)).toBe("Red");
  });

  it("still flips a legacy White/Dark session", () => {
    const legacy = parseTeamColors(["White", "Dark"]);
    expect(nextColor("White", legacy)).toBe("Dark");
    expect(nextColor("Dark", legacy)).toBe("White");
  });

  it("flips between two custom colours", () => {
    const custom = parseTeamColors(["Red", "Blue"]);
    expect(nextColor("Red", custom)).toBe("Blue");
    expect(nextColor("Blue", custom)).toBe("Red");
  });

  it("cycles through three or more", () => {
    const three = parseTeamColors(["Red", "Blue", "Green"]);
    expect(nextColor("Red", three)).toBe("Blue");
    expect(nextColor("Blue", three)).toBe("Green");
    expect(nextColor("Green", three)).toBe("Red");
  });

  it("starts at the first colour when the current one is unset or unknown", () => {
    expect(nextColor(null, DEFAULT_TEAM_COLORS)).toBe("Red");
    expect(nextColor("Chartreuse", DEFAULT_TEAM_COLORS)).toBe("Red");
  });
});

describe("no more White/Dark by default", () => {
  it("defaults new sessions to Red/Blue, not White/Dark", () => {
    expect(DEFAULT_TEAM_COLORS.map(c => c.name)).toEqual(["Red", "Blue"]);
  });

  it("no longer offers White or Dark in the picker", () => {
    const names = PRESET_TEAM_COLORS.map(c => c.name.toLowerCase());
    expect(names).not.toContain("white");
    expect(names).not.toContain("dark");
  });
});

describe("helpers", () => {
  it("colorInitial takes the first letter", () => {
    expect(colorInitial("White")).toBe("W");
    expect(colorInitial("Dark")).toBe("D");
    expect(colorInitial("Red")).toBe("R");
    expect(colorInitial("")).toBe("?");
    expect(colorInitial(null)).toBe("?");
  });

  it("colorNames returns plain names and accepts every stored shape", () => {
    expect(colorNames(["White", "Dark"])).toEqual(["White", "Dark"]);
    expect(colorNames('["Red","Blue"]')).toEqual(["Red", "Blue"]);
    expect(colorNames(null)).toEqual(["Red", "Blue"]);
  });
});
