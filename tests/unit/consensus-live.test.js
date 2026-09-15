import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// At the end of a session evaluators adjust scores and look at Consensus to
// see whether the disagreement cleared. It only loaded when opened, so they
// reloaded the whole page to find out -- which reset the screen and brought
// the session-guidance popup back every time, and still lagged their own
// last edit, which was sitting in a 3-second debounce. So people kept
// adjusting scores that had already been fixed.

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const PAGE = strip(readFileSync(resolve(process.cwd(), "src/app/evaluator/score/[scheduleId]/page.jsx"), "utf8"));
const MODAL = strip(readFileSync(resolve(process.cwd(), "src/components/evaluator-scoring/ConsensusModal.jsx"), "utf8"));

describe("consensus stays live while open", () => {
  it("polls while the panel is open and stops when it closes", () => {
    expect(PAGE).toMatch(/if \(!showConsensus\) return;\s*const t = setInterval\(\(\) => loadConsensus\(true\), 8000\);/);
    expect(PAGE).toMatch(/return \(\) => clearInterval\(t\);/);
  });

  it("a background refresh never blanks the list with a spinner", () => {
    expect(PAGE).toMatch(/if \(!silent\) setConsensusLoading\(true\);/);
    expect(PAGE).toMatch(/if \(!silent\) setConsensusError\(true\);/);
  });

  it("bypasses the browser cache", () => {
    expect(PAGE).toMatch(/consensus\?schedule_id=[^`]*`, \{ cache: "no-store" \}/);
  });

  it("flushes the evaluator's own pending edits before the first read", () => {
    const open = PAGE.slice(PAGE.indexOf("onOpenConsensus={async () => {"), PAGE.indexOf("onOpenConsensus={async () => {") + 700);
    expect(open).toMatch(/Object\.keys\(pending\)/);
    expect(open).toMatch(/syncToServer\(parseInt\(id\), scoresRef\.current\)/);
    expect(open).toMatch(/await loadConsensus\(\);/);
  });

  it("has a manual refresh and shows when it last updated", () => {
    expect(MODAL).toMatch(/onClick=\{onRefresh\}/);
    expect(MODAL).toMatch(/Last update/);
  });
});

describe("the guidance popup shows once per session, not once per reload", () => {
  it("remembers it was shown in sessionStorage keyed by schedule", () => {
    expect(PAGE).toMatch(/ar_guidance_shown_\$\{scheduleId\}/);
    expect(PAGE).toMatch(/sessionStorage\.getItem\(key\) === "1"/);
    expect(PAGE).toMatch(/sessionStorage\.setItem\(key, "1"\)/);
  });
});
