import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Real incident: Confederation's admin got a "42 sessions need evaluators"
// email that was almost entirely garbage -- 21 of the open sessions were
// testing sessions (staffed by testers, not evaluators, so they can never
// have an evaluator signed up and permanently read as understaffed), and the
// query never filtered by organization at all, so every admin's report/alert
// silently included every OTHER org's open sessions too, mislabeled under
// their own org's name. Confederation's actual gap was 5 real sessions each
// needing one more evaluator -- nothing like what went out.

const read = (p) => readFileSync(resolve(process.cwd(), p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const CRON = strip(read("src/app/api/cron/route.js"));
const FN = CRON.slice(CRON.indexOf("async function getSessionStaffing"), CRON.indexOf("export async function GET"));

describe("getSessionStaffing is scoped to one organization", () => {
  it("filters by the org actually passed in", () => {
    expect(FN).toMatch(/ac\.organization_id = \$\{orgId\}/);
  });
});

describe("getSessionStaffing excludes testing sessions", () => {
  it("a testing session can never have an evaluator signed up, so it must never count as understaffed", () => {
    expect(FN).toMatch(/COALESCE\(cs\.session_type, 'evaluation'\) != 'testing'/);
  });
});
