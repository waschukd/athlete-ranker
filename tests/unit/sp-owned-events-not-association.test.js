import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// An SP-owned TESTING event is a schedule row with no age_category_id -- a
// testing-only client with no association behind it. Four queries treated
// "service_provider_id = me" as sufficient, so an association session that
// also carried a service_provider_id was listed as an SP testing event:
//
//   - the SP schedule showed it twice, once real and once as "Testing". VMHA
//     deleted the apparent duplicate and lost the real 11:15 U13 skills
//     session (and its four evaluator sign-ups) with it, because there was
//     only ever one row.
//   - the tester side was worse than cosmetic: an association's skills skate
//     appeared in the open-testing list, and a tester could sign up to it.
const read = (p) => readFileSync(resolve(process.cwd(), p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const SP_OWNED_QUERIES = [
  ["src/app/api/service-provider/schedule/route.js", "WHERE es.service_provider_id = ${spId}"],
  ["src/app/api/service-provider/calendar/route.js", "WHERE es.service_provider_id = ${spId}"],
  ["src/app/api/service-provider/testing-events/route.js", "WHERE es.service_provider_id = ${g.spId}"],
  ["src/app/api/tester/sessions/route.js", "WHERE es.service_provider_id = ANY(${spIds})"],
];

describe("SP-owned testing events never include an association's sessions", () => {
  for (const [path, anchor] of SP_OWNED_QUERIES) {
    it(path, () => {
      const src = strip(read(path));
      const at = src.indexOf(anchor);
      expect(at, `anchor not found in ${path}`).toBeGreaterThan(-1);
      // The guard must sit in the same WHERE clause, within a few lines.
      const clause = src.slice(at, at + 400);
      expect(clause).toMatch(/es\.age_category_id IS NULL/);
    });
  }

  it("the tester signup authorization check guards its SP-owned branch too", () => {
    const src = strip(read("src/app/api/tester/sessions/route.js"));
    expect(src).toMatch(/OR \(es\.service_provider_id = ANY\(\$\{cap\.testerOrgIds\}\) AND es\.age_category_id IS NULL\)/);
  });
});
