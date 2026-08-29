import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// globals.css re-themes the app by overriding specific Tailwind classes under
// [data-theme="premium"] -- .bg-gray-50, .bg-white, .text-gray-700 and so on.
//
// An opacity variant is a DIFFERENT class: .bg-gray-50\/70 is not .bg-gray-50,
// so it escapes the override entirely. The element keeps its near-white light
// background while the text on it IS re-themed to a light colour, giving light
// text on a light row. It looks fine in light mode and unreadable in dark, so it
// ships easily and is only ever caught by someone squinting at a screen.
//
// This has now happened three times (evaluator jersey dots, grid view, the Teams
// tab player list), so it is pinned here.
//
// bg-black/NN and bg-white/NN over a scrim are deliberate translucency for
// modal overlays and are allowed -- they are meant to be see-through in both
// themes. The trap is specifically the gray scale.

const ROOT = process.cwd();
const SCAN = ["src/components", "src/app"];

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(jsx|tsx)$/.test(e)) out.push(full);
  }
  return out;
}

// Only classes globals.css actually re-themes are a problem when suffixed.
const OFFENDER = /\bbg-gray-(50|100|200|300)\/\d+/g;

describe("dark theme: no opacity-suffixed neutral backgrounds", () => {
  it("every themed surface uses a class the theme can actually override", () => {
    const hits = [];
    for (const base of SCAN) {
      for (const file of walk(join(ROOT, base))) {
        const src = readFileSync(file, "utf8");
        const found = src.match(OFFENDER);
        if (found) hits.push(`${relative(ROOT, file)}: ${[...new Set(found)].join(", ")}`);
      }
    }
    expect(
      hits,
      `These backgrounds escape the [data-theme="premium"] override in globals.css, so they stay light in dark mode while the text on them is re-themed light — unreadable.\nDrop the /NN suffix (use bg-gray-50, bg-gray-100, …) or add the exact variant to globals.css.\n\n${hits.join("\n")}`
    ).toEqual([]);
  });

  it("the classes it recommends really are overridden", () => {
    const css = readFileSync(join(ROOT, "src/app/globals.css"), "utf8");
    for (const cls of ["bg-gray-50", "bg-gray-100", "bg-white"]) {
      expect(css, `globals.css no longer overrides .${cls}`).toMatch(
        new RegExp(`\\[data-theme="premium"\\][^{]*\\.${cls.replace(/-/g, "-")}\\b`)
      );
    }
  });
});
