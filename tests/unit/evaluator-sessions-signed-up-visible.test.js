import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The "mine" view hides any evaluation session that overlaps a testing event
// run by an SP the user is a tester for. That is right for OFFERING sessions.
// It was also applied to sessions the evaluator had already signed up for --
// so a tester promoted to evaluator (which keeps the tester flag by design)
// lost every one of her own games on any day CT was testing somewhere. She
// could not open the session she was standing in. Reported three separate
// times as "she can't get into her session" before the cause was found.
//
// A signup is a commitment, not an offer. It is never hidden.

const read = (p) => readFileSync(resolve(process.cwd(), p), "utf8");
const SRC = read("src/app/api/evaluator/sessions/route.js").replace(/^\s*--.*$/gm, "");

describe("a session the evaluator is signed up for is never hidden as a testing conflict", () => {
  it("exempts the user's own signups from the overlap exclusion", () => {
    expect(SRC).toMatch(/EXISTS \(SELECT 1 FROM evaluator_session_signups me WHERE me\.schedule_id = sch\.id AND me\.user_id = \$\{appUId\} AND me\.status = 'signed_up'\)\s*OR NOT EXISTS \(/);
  });

  it("still hides overlapping sessions they have NOT signed up for", () => {
    const block = SRC.slice(SRC.indexOf("OR NOT EXISTS ("), SRC.indexOf("GROUP BY sch.id"));
    expect(block).toMatch(/is_tester = true AND status = 'active'/);
    expect(block).toMatch(/sch\.start_time < tes\.end_time AND tes\.start_time < sch\.end_time/);
  });

  it("only exempts an ACTIVE signup -- a cancelled or released one gets no pass", () => {
    expect(SRC).toMatch(/me\.status = 'signed_up'\)\s*OR NOT EXISTS/);
  });
});
