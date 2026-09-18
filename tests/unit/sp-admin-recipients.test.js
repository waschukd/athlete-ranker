import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Evaluator / tester cancellation and strike alerts are STAFFING mail: they
// go to the service provider's own admins and nobody else. The old inline
// query in three routes matched users.role IN ('service_provider_admin',
// 'association_admin') over every org the evaluator belonged to -- so an SP
// evaluator who happened to be an association admin somewhere received every
// CT cancellation from day one, and association admins could be copied via
// the evaluator's own memberships.
const read = (p) => readFileSync(resolve(process.cwd(), p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const HELPER = strip(read("src/lib/spAdmins.js"));
const ROUTES = [
  "src/app/api/evaluator/signup/route.js",
  "src/app/api/tester/sessions/route.js",
  "src/app/api/categories/[catId]/consensus/route.js",
].map(p => [p, strip(read(p))]);

describe("spAdminRecipients", () => {
  it("requires the service_provider_admin role -- association_admin is never a staffing recipient", () => {
    expect(HELPER).toMatch(/u\.role = 'service_provider_admin'/);
    expect(HELPER).not.toMatch(/association_admin/);
  });
  it("only ever resolves memberships in service-provider orgs", () => {
    expect(HELPER).toMatch(/o\.type = 'service_provider'/);
  });
  it("does not expand to the cancelling evaluator's other orgs", () => {
    expect(HELPER).not.toMatch(/WHERE user_id =/);
  });
});

describe("every cancel / strike / consensus alert goes through the helper", () => {
  for (const [p, src] of ROUTES) {
    it(p, () => {
      expect(src).toMatch(/spAdminRecipients\(/);
      expect(src).not.toMatch(/u\.role IN \('service_provider_admin', 'association_admin'\)/);
    });
  }
});
