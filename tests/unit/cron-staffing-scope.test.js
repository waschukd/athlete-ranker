import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// getSessionStaffing(orgId, daysAhead) accepted orgId and never referenced it,
// and it counted testing sessions. Both inflated the same email:
//
//   No org filter -- every staffing email carried every organization's
//   sessions. Nine org admins each received all 121 sessions across seven
//   associations, daily at 07:00, with category names, dates and the evaluators
//   signed up to them, all mislabeled under their own org. Beaumont's admin was
//   receiving EFHA's schedule. It surfaced only when Confederation's admin asked
//   why she was being told to fill Competitive Thread's sessions.
//
//   Testing sessions counted -- those are staffed by testers, never evaluators,
//   so every one of them permanently read as understaffed.
//
// The third trap is the fix for the first: scoping to ac.organization_id alone
// looks right but breaks the service provider. Competitive Thread owns one
// category and staffs eight associations, so own-org-only scoping sends CT an
// empty alert while the sessions it is actually responsible for go unmentioned.

const read = (p) => readFileSync(resolve(process.cwd(), p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const CRON = strip(read("src/app/api/cron/route.js"));
const FN = CRON.slice(CRON.indexOf("async function getSessionStaffing"), CRON.indexOf("export async function GET"));

describe("staffing emails are scoped to the recipient", () => {
  it("filters by the org actually passed in", () => {
    expect(FN).toMatch(/\$\{orgId\}/);
  });

  it("an association sees its own sessions", () => {
    expect(FN).toMatch(/ac\.organization_id = \$\{orgId\}/);
  });

  it("a service provider also sees the associations it is linked to", () => {
    // Without this CT's alert is empty -- it owns one category and staffs eight
    // associations, so its own org's sessions are not the ones it cares about.
    expect(FN).toMatch(/sp_association_links sal/);
    expect(FN).toMatch(/sal\.service_provider_id = \$\{orgId\}/);
    expect(FN).toMatch(/WHERE \(sal\.service_provider_id = \$\{orgId\} OR ac\.organization_id = \$\{orgId\}\)/);
  });

  it("links on the association side, not the provider side", () => {
    // Getting these backwards silently returns nothing.
    expect(FN).toMatch(/sal\.association_id = ac\.organization_id/);
  });
});

describe("testing sessions are not counted as understaffed", () => {
  it("excludes them, since testers staff those and evaluators never can", () => {
    expect(FN).toMatch(/COALESCE\(cs\.session_type, 'evaluation'\) != 'testing'/);
  });

  it("defaults a null session_type to evaluation rather than dropping the row", () => {
    // A plain `cs.session_type != 'testing'` is NULL for most sessions and
    // filters out everything.
    expect(FN).toMatch(/COALESCE\(cs\.session_type, 'evaluation'\)/);
  });
});

describe("staffing emails go to service providers only", () => {
  const ADMINS = CRON.slice(CRON.indexOf("const admins = await sql`"), CRON.indexOf("let sent = 0"));

  it("goes to service providers and nobody else", () => {
    // Confederation's registrar was emailed "these sessions need evaluators"
    // about sessions she has no evaluator pool for and no way to staff.
    expect(ADMINS).toMatch(/o\.type = 'service_provider'/);
  });

  it("excludes goalie providers, who staff no evaluator roster", () => {
    expect(ADMINS).not.toMatch(/goalie_service_provider/);
  });

  it("does not select every org's contact and filter later", () => {
    // The filter has to be in the query -- a later filter is what this was.
    expect(ADMINS).toMatch(/WHERE[\s\S]*o\.type = 'service_provider'/);
  });
});
