// Real incident: an evaluator's own "Hours & Pay" dashboard joined
// evaluator_hours to their membership by matching eh.organization_id =
// em.organization_id -- but hours are stamped with the org that actually RAN
// the session, while an evaluator's rate lives on a membership with the
// SERVICE PROVIDER that placed them there. Someone with one membership
// (Competitive Thread) whose real hours were tagged to a client association
// it staffs (KC North) matched nothing and saw $0 -- while the SP admin's own
// payroll view (service-provider/payroll/route.js), which resolves the hour's
// org from the SESSION and expands through sp_association_links, already
// counted those same hours correctly. Verified against production: this
// reconciled a real evaluator from $3,600 (wrong) to $4,775 (matching payroll)
// and another from $0 (wrong) to $300 (their real logged hours).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p) => readFileSync(resolve(process.cwd(), p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const PAY_ROUTE = strip(read("src/app/api/evaluator/pay/route.js"));
const PAYROLL_ROUTE = strip(read("src/app/api/service-provider/payroll/route.js"));

describe("evaluator's own pay view resolves org the same way SP payroll does", () => {
  it("no longer joins evaluator_hours by matching organization_id to the membership", () => {
    expect(PAY_ROUTE).not.toMatch(/eh\.organization_id\s*=\s*em\.organization_id/);
  });

  it("resolves the hour's real org from the session it was logged against", () => {
    expect(PAY_ROUTE).toMatch(/JOIN evaluation_schedule es ON es\.id = h\.schedule_id/);
  });

  it("expands a service-provider membership through its linked associations", () => {
    expect(PAY_ROUTE).toMatch(/FROM sp_association_links/);
    expect(PAY_ROUTE).toMatch(/service_provider_id = em\.organization_id/);
  });

  it("also credits hours whose real org is the membership's own org directly", () => {
    expect(PAY_ROUTE).toMatch(/ac\.organization_id = em\.organization_id/);
  });

  it("also credits SP-owned testing events by service_provider_id", () => {
    expect(PAY_ROUTE).toMatch(/es\.service_provider_id = em\.organization_id/);
  });

  it("both routes classify testing the same way (testing session type, or SP-owned event)", () => {
    const isTestingPattern = /session_type,?\s*'?['"]?\)\s*=\s*['"]testing['"]|cs\.session_type = 'testing'/;
    expect(PAY_ROUTE).toMatch(isTestingPattern);
    expect(PAYROLL_ROUTE).toMatch(isTestingPattern);
    expect(PAY_ROUTE).toMatch(/service_provider_id IS NOT NULL/);
    expect(PAYROLL_ROUTE).toMatch(/service_provider_id IS NOT NULL/);
  });
});
