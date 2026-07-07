import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// Bulk-onboard E2E: runs the REAL Fable 5 schedule normalizer, canonicalizes the
// divisions, drives the REAL commit endpoint against the live DB, asserts categories
// were created and the schedule routed, then cleans up. Makes ONE AI call per run.
// Skips the AI portion if ANTHROPIC_API_KEY isn't present locally.
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(async () => ({ email: "bulk@integration.local", role: "super_admin", name: "Bulk Test" })),
  getAppUserId: vi.fn(async () => null),
  resolveSpContext: vi.fn(async () => ({ orgId: null, isGoalie: false, type: null })),
}));
vi.mock("@/lib/authorize", () => ({
  authorizeOrgAccess: vi.fn(async () => ({ authorized: true })),
  authorizeCategoryAccess: vi.fn(async () => ({ authorized: true })),
}));

const sql = (await import("@/lib/db")).default;
const { normalizeSchedule } = await import("@/lib/scheduleNormalize");
const { canonicalDivision } = await import("@/lib/divisionKey");
const { POST: commitPOST } = await import("@/app/api/organizations/[orgId]/bulk-onboard/commit/route");

const HAS_KEY = !!process.env.ANTHROPIC_API_KEY;
const state = { org: null };

// Small, deliberately-messy schedule grid (section/date headers, matchup labels,
// mixed divisions, a testing row) — enough to exercise the AI cheaply.
const GRID = [
  ["", "DATE", "DOW", "START", "END", "ARENA"],
  ["Bulk Test Association"],
  ["Monday September 1, 2026"],
  ["U11 AA TEAM 1 // U11 AA TEAM 2", "9/1/2026", "MON", "5:00 PM", "6:00 PM", "Rink A"],
  ["U13 AA TEAM 1 // U13 AA TEAM 2", "9/1/2026", "MON", "6:15 PM", "7:15 PM", "Rink A"],
  ["Wednesday September 3, 2026"],
  ["U11 AA SCRIMMAGE", "9/3/2026", "WED", "5:00 PM", "6:00 PM", "Rink B"],
  ["U13 AA SCRIMMAGE", "9/3/2026", "WED", "6:15 PM", "7:15 PM", "Rink B"],
  ["Sunday September 6, 2026"],
  ["U9 TIME TRIALS GROUP 1", "9/6/2026", "SUN", "8:00 AM", "9:00 AM", "Rink A"],
];

beforeAll(async () => {
  [state.org] = await sql`INSERT INTO organizations (name, type, contact_email) VALUES ('Bulk Test Org', 'association', 'bulk@flowtest.local') RETURNING id`;
}, 60000);

afterAll(async () => {
  if (!state.org?.id) return;
  const cats = await sql`SELECT id FROM age_categories WHERE organization_id = ${state.org.id}`;
  for (const c of cats) {
    await sql`DELETE FROM evaluation_schedule WHERE age_category_id = ${c.id}`;
    await sql`DELETE FROM scoring_categories WHERE age_category_id = ${c.id}`;
    await sql`DELETE FROM category_sessions WHERE age_category_id = ${c.id}`;
    await sql`DELETE FROM athletes WHERE age_category_id = ${c.id}`;
  }
  await sql`DELETE FROM age_categories WHERE organization_id = ${state.org.id}`;
  await sql`DELETE FROM organizations WHERE id = ${state.org.id}`;
}, 60000);

describe("Bulk onboarding E2E (real AI)", () => {
  it.skipIf(!HAS_KEY)("normalizes a messy schedule, creates categories, routes the schedule", async () => {
    // 1) Real Fable 5 call.
    const norm = await normalizeSchedule(GRID, { apiKey: process.env.ANTHROPIC_API_KEY });
    expect(norm.rows.length).toBeGreaterThan(0);

    // 2) Canonicalize → divisions + tagged rows.
    const tagged = norm.rows.map(r => ({ ...r, divisionKey: canonicalDivision({ ageGroup: r.age_group, division: r.division, label: r.raw_label })?.key || null }));
    const keys = [...new Set(tagged.filter(r => r.divisionKey).map(r => r.divisionKey))];
    // AA must be distinct and detected.
    expect(keys).toContain("U11 AA");
    expect(keys).toContain("U13 AA");

    // 3) Commit — create every detected division.
    const decisions = keys.map(k => ({ key: k, action: "create", name: k }));
    const req = new Request(`http://test/api/organizations/${state.org.id}/bulk-onboard/commit`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decisions, scheduleRows: tagged, athletes: [] }),
    });
    const res = await commitPOST(req, { params: { orgId: String(state.org.id) } });
    const d = await res.json();
    expect(d.success).toBe(true);
    expect(d.categoriesCreated).toBe(keys.length);
    expect(d.scheduleImported).toBeGreaterThan(0);

    // 4) Verify in the DB: categories exist with sessions + routed schedule.
    const cats = await sql`SELECT id, name FROM age_categories WHERE organization_id = ${state.org.id} ORDER BY name`;
    expect(cats.length).toBe(keys.length);
    const u11 = cats.find(c => c.name === "U11 AA");
    expect(u11).toBeTruthy();
    const [sess] = await sql`SELECT COUNT(*)::int n FROM category_sessions WHERE age_category_id = ${u11.id}`;
    expect(sess.n).toBeGreaterThan(0);
    const [sched] = await sql`SELECT COUNT(*)::int n FROM evaluation_schedule WHERE age_category_id = ${u11.id}`;
    expect(sched.n).toBeGreaterThan(0);
  }, 60000);

  it("commit endpoint routes a roster-only division with no AI (always runs)", async () => {
    // Deterministic path — proves commit + category creation + athlete routing
    // without any AI spend.
    const athletes = [
      { first_name: "Test", last_name: "One", position: "forward", birth_year: 2015, external_id: "BT1", divisionKey: "U15 A" },
      { first_name: "Test", last_name: "Two", position: "defense", birth_year: 2015, external_id: "BT2", divisionKey: "U15 A" },
    ];
    const req = new Request(`http://test/api/organizations/${state.org.id}/bulk-onboard/commit`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decisions: [{ key: "U15 A", action: "create", name: "U15 A" }], scheduleRows: [], athletes }),
    });
    const res = await commitPOST(req, { params: { orgId: String(state.org.id) } });
    const d = await res.json();
    expect(d.success).toBe(true);
    expect(d.athletesImported).toBe(2);
    const rows = await sql`SELECT a.id FROM athletes a JOIN age_categories ac ON ac.id = a.age_category_id WHERE ac.organization_id = ${state.org.id} AND ac.name = 'U15 A'`;
    expect(rows.length).toBe(2);
  }, 60000);
});
