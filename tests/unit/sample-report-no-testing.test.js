import { describe, it, expect } from "vitest";
import { SAMPLE_REPORT_DATA, SAMPLE_REPORT_DATA_MILLWOODS, SAMPLE_REPORT_DATA_VMHA } from "@/lib/sampleReport";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Associations that run no objective testing get a different-looking report:
// the whole testing section drops out. A sample built on a testing association
// misrepresents what their parents would buy, and the landing copy promised
// "objective testing" to everyone regardless.
const read = (p) => readFileSync(resolve(process.cwd(), p), "utf8");
const LANDING = read("src/app/report/sample/page.jsx");
const PDF = read("src/app/report/sample/pdf/page.jsx");
const REPORT = read("src/components/DevelopmentReport.jsx");

describe("the no-testing sample", () => {
  it("carries no testing profile at all", () => {
    expect(SAMPLE_REPORT_DATA_VMHA.testingProfile).toEqual([]);
    // The others still do -- this is an addition, not a change to them.
    expect(SAMPLE_REPORT_DATA.testingProfile.length).toBeGreaterThan(0);
    expect(SAMPLE_REPORT_DATA_MILLWOODS.testingProfile.length).toBeGreaterThan(0);
  });

  it("matches the shape it is meant to represent: one skills skate, two games", () => {
    expect(SAMPLE_REPORT_DATA_VMHA.progress.map(p => p.session_number)).toEqual([1, 2, 3]);
    expect(SAMPLE_REPORT_DATA_VMHA.skillProfile).toHaveLength(4);
    expect(SAMPLE_REPORT_DATA_VMHA.skillProfile.map(s => s.name))
      .toEqual(["Skating", "Puck Skills", "Effort / Compete", "Hockey Sense"]);
    expect(new Set(SAMPLE_REPORT_DATA_VMHA.notes.map(n => n.session_number))).toEqual(new Set([1, 2, 3]));
  });

  it("never mentions testing in its narrative -- there is none to report on", () => {
    const text = (SAMPLE_REPORT_DATA_VMHA.narrativeSummary + " " + SAMPLE_REPORT_DATA_VMHA.notes.map(n => n.note_text).join(" ")).toLowerCase();
    for (const word of ["testing", "sprint", "on the clock", "stopwatch", "timed"]) {
      expect(text).not.toContain(word);
    }
  });

  it("is internally consistent: the narrative's weakness is the lowest grade", () => {
    const lowest = [...SAMPLE_REPORT_DATA_VMHA.skillProfile].sort((a, b) => a.player - b.player)[0];
    expect(lowest.name).toBe("Puck Skills");
    expect(SAMPLE_REPORT_DATA_VMHA.narrativeSummary.toLowerCase()).toContain("puck skills");
    const best = [...SAMPLE_REPORT_DATA_VMHA.skillProfile].sort((a, b) => b.player - a.player)[0];
    expect(best.name).toBe("Effort / Compete");
    expect(SAMPLE_REPORT_DATA_VMHA.narrativeSummary.toLowerCase()).toContain("compete");
  });

  it("the report itself already omits the testing section when there is none", () => {
    expect(REPORT).toMatch(/\{testingProfile\.length > 0 && \(/);
  });

  it("both sample pages resolve ?org=vmha, and the full-report link keeps the org", () => {
    for (const src of [LANDING, PDF]) {
      expect(src).toMatch(/org === "vmha" \? SAMPLE_REPORT_DATA_VMHA/);
    }
    expect(LANDING).toMatch(/\/report\/sample\/pdf\$\{org \? `\?org=\$\{org\}` : ""\}/);
  });

  it("the landing copy does not promise testing to an association without it", () => {
    expect(LANDING).toMatch(/const hasTesting = \(data\.testingProfile \|\| \[\]\)\.length > 0/);
    expect(LANDING).toMatch(/hasTesting \? "Objective testing, evaluator" : "Evaluator"/);
    expect(LANDING).toMatch(/hasTesting \? "objective testing, " : ""/);
  });
});
