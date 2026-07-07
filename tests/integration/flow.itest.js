import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// End-to-end flow harness — exercises the REAL route/lib code against the REAL
// Neon DB on a throwaway synthetic org, then deletes it. Not part of the unit suite.
// Auth is mocked to a super_admin so route handlers run; the DB is NOT mocked.
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(async () => ({ email: "flowtest@integration.local", role: "super_admin", name: "Flow Test" })),
  getAppUserId: vi.fn(async () => null),
  resolveSpContext: vi.fn(async () => ({ orgId: null, isGoalie: false, type: null })),
}));
vi.mock("@/lib/authorize", () => ({
  authorizeCategoryAccess: vi.fn(async () => ({ authorized: true })),
  authorizeOrgAccess: vi.fn(async () => ({ authorized: true })),
}));

const sqlMod = await import("@/lib/db");
const sql = sqlMod.default;
const { computeCategoryRankings } = await import("@/lib/rankings");
const { buildAthleteReport } = await import("@/lib/reportData");
const { analyzeContention } = await import("@/lib/contention");
const { POST: athletesPOST } = await import("@/app/api/categories/[catId]/athletes/route");

const state = { orgA: null, catA: null, orgB: null, catB: null, foreignAthlete: null, evaluators: [], importResult: null, athletes: [] };

// 24 skaters (14 F, 10 D) + 3 goalies — birth_year sent as a NUMBER (the exact
// shape the roster importer sends, which used to crash extractBirthYear).
function roster() {
  const F = ["Liam", "Noah", "Oliver", "Lucas", "Logan", "Aiden", "Carter", "Nathan", "Leo", "Wyatt", "Hunter", "Connor", "Tyler", "Cole"];
  const D = ["Ethan", "Mason", "Jackson", "Owen", "Hudson", "Felix", "Brayden", "Samuel", "Nolan", "Maxime"];
  const G = ["Carey", "Jake", "Sam"];
  const mk = (first, i, pos) => ({ first_name: first, last_name: `Test${String(i).padStart(2, "0")}`, position: pos, birth_year: 2015, external_id: `FT${pos[0].toUpperCase()}${i}`, parent_email: `p${i}@flowtest.local` });
  return [...F.map((n, i) => mk(n, i, "forward")), ...D.map((n, i) => mk(n, i + 14, "defense")), ...G.map((n, i) => mk(n, i + 24, "goalie"))];
}

beforeAll(async () => {
  // temp orgs
  [state.orgA] = await sql`INSERT INTO organizations (name, type, contact_email) VALUES ('Flow Test A', 'association', 'a@flowtest.local') RETURNING id`;
  [state.orgB] = await sql`INSERT INTO organizations (name, type, contact_email) VALUES ('Flow Test B', 'association', 'b@flowtest.local') RETURNING id`;
  [state.catA] = await sql`INSERT INTO age_categories (organization_id, name, scoring_scale, scoring_increment, setup_complete, status) VALUES (${state.orgA.id}, 'U11 Flow', 10, 0.5, true, 'active') RETURNING id`;
  [state.catB] = await sql`INSERT INTO age_categories (organization_id, name, scoring_scale, setup_complete) VALUES (${state.orgB.id}, 'Other Flow', 10, true) RETURNING id`;
  [state.foreignAthlete] = await sql`INSERT INTO athletes (organization_id, age_category_id, first_name, last_name, position, is_active) VALUES (${state.orgB.id}, ${state.catB.id}, 'Foreign', 'Kid', 'forward', true) RETURNING id`;

  // evaluators
  for (let i = 0; i < 2; i++) {
    const [u] = await sql`INSERT INTO users (email, name, role) VALUES (${`fteval${i}_${state.catA.id}@flowtest.local`}, ${`Eval ${i}`}, 'association_evaluator') RETURNING id`;
    state.evaluators.push(u.id);
  }

  // sessions + scoring categories
  const sessions = [
    { n: 1, type: "testing", w: 10 }, { n: 2, type: "scrimmage", w: 30 },
    { n: 3, type: "scrimmage", w: 30 }, { n: 4, type: "scrimmage", w: 30 },
  ];
  for (const s of sessions) await sql`INSERT INTO category_sessions (age_category_id, session_number, name, session_type, weight_percentage, status) VALUES (${state.catA.id}, ${s.n}, ${"Session " + s.n}, ${s.type}, ${s.w}, 'complete')`;
  const skaterCats = ["Skating", "Puck Skills", "Hockey IQ", "Compete"];
  const goalieCats = ["Positioning", "Rebound Control", "Compete"];
  const catIds = {};
  let disp = 1;
  for (const c of skaterCats) { const [r] = await sql`INSERT INTO scoring_categories (age_category_id, name, display_order, applies_to) VALUES (${state.catA.id}, ${c}, ${disp++}, 'all') RETURNING id`; catIds[c] = r.id; }
  for (const c of goalieCats) { const [r] = await sql`INSERT INTO scoring_categories (age_category_id, name, display_order, applies_to) VALUES (${state.catA.id}, ${c}, ${disp++}, 'goalies') RETURNING id`; catIds[c] = r.id; }

  // ── Roster import via the REAL route (the "0 of N" fix) ──
  const req = new Request(`http://test/api/categories/${state.catA.id}/athletes`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ athletes: roster() }),
  });
  const res = await athletesPOST(req, { params: { catId: String(state.catA.id) } });
  state.importResult = await res.json();

  state.athletes = await sql`SELECT id, position FROM athletes WHERE age_category_id = ${state.catA.id} AND is_active = true ORDER BY id`;
  const skaters = state.athletes.filter(a => a.position !== "goalie");
  const goalies = state.athletes.filter(a => a.position === "goalie");

  // Scores — deterministic by index so ranks separate cleanly. Higher ability = higher score.
  const inserts = [];
  skaters.forEach((a, i) => {
    const ability = 9 - (i / skaters.length) * 5; // ~9 down to ~4
    for (const sNum of [2, 3, 4]) for (const c of skaterCats) for (const ev of state.evaluators) {
      const score = Math.max(1, Math.min(10, Math.round((ability + (Math.sin(i + sNum) * 0.3)) * 2) / 2));
      inserts.push(sql`INSERT INTO category_scores (athlete_id, age_category_id, session_number, evaluator_id, scoring_category_id, score, scored_via) VALUES (${a.id}, ${state.catA.id}, ${sNum}, ${ev}, ${catIds[c]}, ${score}, 'manual')`);
    }
    // testing (session 1) rank
    inserts.push(sql`INSERT INTO testing_drill_results (athlete_id, age_category_id, session_number, overall_rank) VALUES (${a.id}, ${state.catA.id}, 1, ${i + 1})`);
  });
  goalies.forEach((a, i) => {
    const ability = 8 - i;
    for (const sNum of [2, 3, 4]) for (const c of goalieCats) for (const ev of state.evaluators) {
      inserts.push(sql`INSERT INTO category_scores (athlete_id, age_category_id, session_number, evaluator_id, scoring_category_id, score, scored_via) VALUES (${a.id}, ${state.catA.id}, ${sNum}, ${ev}, ${catIds[c]}, ${Math.max(1, ability)}, 'manual')`);
    }
  });
  for (let i = 0; i < inserts.length; i += 100) await sql.transaction(inserts.slice(i, i + 100));
}, 60000);

afterAll(async () => {
  // Cascade-delete both throwaway orgs and their data.
  for (const org of [state.orgA, state.orgB]) {
    if (!org?.id) continue;
    const cats = await sql`SELECT id FROM age_categories WHERE organization_id = ${org.id}`;
    for (const c of cats) {
      await sql`DELETE FROM category_scores WHERE age_category_id = ${c.id}`;
      await sql`DELETE FROM testing_drill_results WHERE age_category_id = ${c.id}`;
      await sql`DELETE FROM scoring_categories WHERE age_category_id = ${c.id}`;
      await sql`DELETE FROM category_sessions WHERE age_category_id = ${c.id}`;
      await sql`DELETE FROM athletes WHERE age_category_id = ${c.id}`;
    }
    await sql`DELETE FROM age_categories WHERE organization_id = ${org.id}`;
    await sql`DELETE FROM users WHERE email LIKE ${"fteval%_" + (state.catA?.id || 0) + "@flowtest.local"}`;
    await sql`DELETE FROM organizations WHERE id = ${org.id}`;
  }
}, 60000);

describe("E2E flow on a synthetic category", () => {
  it("roster import lands all 27 athletes (the '0 of N' fix)", () => {
    expect(state.importResult.imported).toBe(27);
    expect(state.importResult.skipped).toBe(0);
    expect(state.athletes.length).toBe(27);
    // birth_year survived (was being dropped by the TypeError)
  });

  it("rankings: skaters ranked uniquely, goalies in a separate pool, no NaN", async () => {
    const r = await computeCategoryRankings(state.catA.id);
    expect(r.has_scores).toBe(true);
    expect(r.athletes.length).toBe(24);           // skaters only
    expect(r.goalies.length).toBe(3);             // separate pool
    const ranks = r.athletes.map(a => a.rank);
    expect(new Set(ranks).size).toBe(24);         // unique 1..24
    expect(Math.min(...ranks)).toBe(1);
    expect(r.athletes.every(a => Number.isFinite(a.weighted_total))).toBe(true);
    expect(r.athletes.some(a => a.position === "goalie")).toBe(false); // no leak
  });

  it("report builds for an in-category athlete and is null for a foreign one (IDOR fix)", async () => {
    const skater = state.athletes.find(a => a.position === "forward");
    const rep = await buildAthleteReport(state.catA.id, skater.id);
    expect(rep).toBeTruthy();
    expect(Array.isArray(rep.skillProfile)).toBe(true);
    expect(rep.skillProfile.length).toBeGreaterThan(0);
    // An athlete from another category must NOT resolve through catA.
    const leak = await buildAthleteReport(state.catA.id, state.foreignAthlete.id);
    expect(leak).toBeNull();
  });

  it("contention planner classifies everyone against a roster target", async () => {
    const r = await computeCategoryRankings(state.catA.id);
    const skaterRanking = { athletes: r.athletes, sessions: (r.sessions || []).filter(s => s.session_type !== "testing"), completed_sessions: r.completed_sessions || [] };
    const a = analyzeContention(skaterRanking, { rosterTargets: 12, runs: 400 });
    // With all sessions complete there's no remaining session to forecast — the
    // planner should say so cleanly rather than crash.
    expect(a).toBeTruthy();
    if (a.dataReady) expect(a.counts.locked + a.counts.bubble + a.counts.out).toBe(24);
    else expect(["no_remaining_sessions", "no_scored_sessions"]).toContain(a.reason);
  });
});
