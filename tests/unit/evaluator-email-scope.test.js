import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Nothing addressed to evaluators may reach anyone who is not one. Two flows
// held only by accident:
//
//   The automatic spot-fill picked evaluators by users.role, not by the
//   membership's is_evaluator flag, and had no coach exclusion -- an
//   association's coach accounts could be recruited to fill an evaluator spot.
//
//   The admin "message all evaluators" pool was built from every org the admin
//   can SEE (a service provider's linked associations included), not the org
//   they belong to. It only ever landed on CT's own pool because those
//   associations hold no non-coach evaluators today.
//
// And the coach rule itself was wrong in the other direction: "any coach
// anywhere" silently dropped a real CT evaluator who also coaches for EFHA from
// CT's own messages. Coaching for one org does not stop you being an evaluator
// for another.

const read = (p) => readFileSync(resolve(process.cwd(), p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const NOTIFY = strip(read("src/lib/scheduleNotify.js"));
const MESSAGES = strip(read("src/app/api/messages/route.js"));
const AUTHZ = strip(read("src/lib/authorize.js"));
// Automatic spot-fill recruiting moved from scheduleNotify.js's per-event
// offerOpenSession into cron/route.js's spot_fill_digest (one consolidated
// daily email per evaluator instead of one blast per event) -- this is the
// pool query's new home.
const CRON = strip(read("src/app/api/cron/route.js"));

const POOL = CRON.slice(CRON.indexOf("const evaluatorPool = await sql`"), CRON.indexOf("`;", CRON.indexOf("const evaluatorPool = await sql`")));

// The exact shape both routes must use: a coach is excluded only for the org
// they coach in.
const ORG_SCOPED_COACH = /ce\.kind = 'coach' AND cac\.organization_id = em\.organization_id/;

describe("automatic spot-fill recruits evaluators, not roles", () => {
  it("keys on the membership flag, not users.role", () => {
    expect(POOL).toMatch(/em\.is_evaluator = true/);
    expect(POOL).not.toMatch(/u\.role IN/);
  });

  it("excludes coaches for the org they coach in", () => {
    expect(POOL).toMatch(ORG_SCOPED_COACH);
  });

  it("still skips people already signed up", () => {
    // The digest checks this per-session (an evaluator can be committed to
    // some sessions in the open list and not others) rather than as a single
    // blanket exclusion in the pool query itself -- look for that filter in
    // the evaluator-digest send loop right after the pool query.
    const sendLoop = CRON.slice(CRON.indexOf("const evaluatorPool = await sql`"), CRON.indexOf("if (openTesting.length)"));
    expect(sendLoop).toMatch(/FROM evaluator_session_signups WHERE user_id = .*AND status = 'signed_up'/);
    expect(sendLoop).toMatch(/alreadyOnSet/);
  });
});

describe("an admin's 'all evaluators' means the org they belong to", () => {
  it("addresses the pool by own orgs, not accessible orgs", () => {
    const block = MESSAGES.slice(MESSAGES.indexOf("ADMIN_ROLES.has(session.role)"), MESSAGES.indexOf("EVAL_ROLES.has(session.role)"));
    expect(block).toMatch(/getOwnOrgIds\(session\)/);
    expect(block).not.toMatch(/getAccessibleOrgIds\(session\)/);
  });

  it("getOwnOrgIds does not expand to a provider's linked associations", () => {
    const fn = AUTHZ.slice(AUTHZ.indexOf("export async function getOwnOrgIds"), AUTHZ.indexOf("export async function getAccessibleOrgIds"));
    expect(fn).not.toMatch(/sp_association_links/);
    // The three real ties: contact, admin role, membership.
    expect(fn).toMatch(/contact_email/);
    expect(fn).toMatch(/user_organization_roles/);
    expect(fn).toMatch(/evaluator_memberships/);
  });

  it("getAccessibleOrgIds still expands, so viewing linked schedules is unchanged", () => {
    const fn = AUTHZ.slice(AUTHZ.indexOf("export async function getAccessibleOrgIds"));
    expect(fn).toMatch(/getOwnOrgIds\(session\)/);
    expect(fn).toMatch(/sp_association_links/);
  });
});

describe("the coach exclusion is per org, everywhere it is used", () => {
  it("messages route: both pool queries", () => {
    const hits = MESSAGES.match(ORG_SCOPED_COACH) || [];
    expect((MESSAGES.match(/ce\.kind = 'coach'/g) || []).length).toBe(2);
    expect((MESSAGES.match(ORG_SCOPED_COACH.source ? new RegExp(ORG_SCOPED_COACH.source, "g") : ORG_SCOPED_COACH) || []).length).toBe(2);
  });

  it("no remaining blanket 'any coach anywhere' exclusion", () => {
    for (const src of [NOTIFY, MESSAGES, CRON]) {
      // The old form: a coach subquery with no organization condition.
      expect(src).not.toMatch(/ce\.kind = 'coach'\)/);
    }
  });
});
