# Tournament Onboarding & Teams — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let associations set up a "Tournament" (round-robin/teams) division from the all-association bulk load and the per-category wizard, with a first-class Teams tab whose team moves never disturb played games.

**Architecture:** Reuse the existing round-robin engine (`age_categories.eval_format='round_robin'`, `scrimmage_teams`, `resolveMatchupTeams`/`assignMatchupRoster`). Persist each Tournament game's matchup label on `evaluation_schedule.matchup` so teams can be assigned later. A new `applyAllMatchups` resolves matchups only for un-played games. The bulk template gains `Format` + `Session #` + `Group/Matchup` columns; parse/commit honor them.

**Tech Stack:** Next.js App Router route handlers, `@neondatabase/serverless` (`sql` tagged templates), React (client components), Vitest (unit + integration).

**Migrations (already applied by the user):** `ALTER TABLE evaluation_schedule ADD COLUMN IF NOT EXISTS matchup text;`

**Naming:** internal `eval_format` value stays `round_robin`; all user-facing copy says **"Tournament"** / **"Standard"**.

---

### Task 1: Persist matchup label on schedule rows

**Files:**
- Modify: `src/app/api/categories/[catId]/schedule/route.js` (POST single-add ~111-121, bulk insert ~176-190, bulk update ~162-174)
- Test: `tests/integration/schedule-matchup.itest.js`

- [ ] **Step 1: Write the failing integration test**

```javascript
// tests/integration/schedule-matchup.itest.js
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(async () => ({ email: "t@local", role: "super_admin", name: "T" })),
  getAppUserId: vi.fn(async () => null),
}));
vi.mock("@/lib/authorize", () => ({ authorizeCategoryAccess: vi.fn(async () => ({ authorized: true })) }));
vi.mock("@/lib/scheduleNotify", () => ({
  notifySessionChange: vi.fn(async () => ({ notified: 0 })),
  offerOpenSession: vi.fn(async () => ({ offered: 0 })),
  notifyParentsIfImminent: vi.fn(async () => ({ notified: 0 })),
}));

const sql = (await import("@/lib/db")).default;
const { POST } = await import("@/app/api/categories/[catId]/schedule/route");

const state = { org: null, cat: null };
beforeAll(async () => {
  [state.org] = await sql`INSERT INTO organizations (name, type, contact_email) VALUES ('MU Org','association','mu@local') RETURNING id`;
  [state.cat] = await sql`INSERT INTO age_categories (organization_id, name, status, setup_complete) VALUES (${state.org.id}, 'U11 AA', 'active', true) RETURNING id`;
  await sql`INSERT INTO category_sessions (age_category_id, session_number, name, session_type, weight_percentage, status) VALUES (${state.cat.id}, 1, 'S1', 'scrimmage', 100, 'scheduled')`;
}, 60000);
afterAll(async () => {
  if (!state.cat?.id) return;
  await sql`DELETE FROM evaluation_schedule WHERE age_category_id = ${state.cat.id}`;
  await sql`DELETE FROM category_sessions WHERE age_category_id = ${state.cat.id}`;
  await sql`DELETE FROM age_categories WHERE id = ${state.cat.id}`;
  await sql`DELETE FROM organizations WHERE id = ${state.org.id}`;
}, 60000);

describe("schedule matchup persistence", () => {
  it("stores the matchup label on a single add", async () => {
    const req = new Request(`http://t/api/categories/${state.cat.id}/schedule`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ add: { session_number: 1, group_number: 1, scheduled_date: "2026-09-19", matchup: "A vs B" } }),
    });
    const res = await POST(req, { params: { catId: String(state.cat.id) } });
    const d = await res.json();
    expect(d.success).toBe(true);
    const [row] = await sql`SELECT matchup FROM evaluation_schedule WHERE id = ${d.session.id}`;
    expect(row.matchup).toBe("A vs B");
  }, 60000);
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run -c vitest.integration.config.js tests/integration/schedule-matchup.itest.js`
Expected: FAIL — `row.matchup` is `null`/undefined (column not written).

- [ ] **Step 3: Write the matchup value once in the single-add path**

In the `if (body.add)` block, immediately after the line `const goalie_evaluators_required = parseInt(a.goalie_evaluators_required ?? 0) || 0;` add:

```javascript
      const matchup = a.matchup || a.Matchup || null;
```

Then change the single-add INSERT to include the column + value. Replace:

```javascript
        INSERT INTO evaluation_schedule (
          age_category_id, session_number, group_number, scheduled_date, day_of_week,
          start_time, end_time, location, checkin_code, evaluators_required, goalie_evaluators_required, testers_required, status
        ) VALUES (
          ${catId}, ${session_number}, ${group_number}, ${a.scheduled_date}, ${a.day_of_week || null},
          ${a.start_time || null}, ${a.end_time || null}, ${a.location || null}, ${code}, ${evaluators_required}, ${goalie_evaluators_required}, ${testers_required}, 'scheduled'
        ) RETURNING *
```

with:

```javascript
        INSERT INTO evaluation_schedule (
          age_category_id, session_number, group_number, scheduled_date, day_of_week,
          start_time, end_time, location, checkin_code, evaluators_required, goalie_evaluators_required, testers_required, matchup, status
        ) VALUES (
          ${catId}, ${session_number}, ${group_number}, ${a.scheduled_date}, ${a.day_of_week || null},
          ${a.start_time || null}, ${a.end_time || null}, ${a.location || null}, ${code}, ${evaluators_required}, ${goalie_evaluators_required}, ${testers_required}, ${matchup}, 'scheduled'
        ) RETURNING *
```

- [ ] **Step 4: Store matchup in the bulk upload paths**

In the bulk loop, after `const goalie_evaluators_required = parseInt(entry.goalie_evaluators_required || entry["Goalie Evaluators"] || 0) || 0;` add:

```javascript
      const matchup = entry.matchup || entry.Matchup || entry["Matchup"] || null;
```

In the bulk UPDATE (existing row), add matchup preservation — change the `SET` list to also include (insert before `testers_required = CASE...`):

```javascript
            matchup = COALESCE(${matchup}, matchup),
```

In the bulk INSERT (new row), mirror the single-add change: add `matchup` to the column list (before `status`) and `${matchup}` to the values (before `'scheduled'`).

- [ ] **Step 5: Run the test — expect PASS**

Run: `npx vitest run -c vitest.integration.config.js tests/integration/schedule-matchup.itest.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/categories/[catId]/schedule/route.js tests/integration/schedule-matchup.itest.js
git commit -m "feat(schedule): persist matchup label on evaluation_schedule rows"
```

---

### Task 2: `applyAllMatchups` — resolve only un-played games

**Files:**
- Modify: `src/lib/scrimmageTeams.js` (add `isGameFrozen` + `applyAllMatchups`)
- Test: `tests/unit/scrimmageTeams.test.js`

- [ ] **Step 1: Write the failing unit test for the freeze predicate**

```javascript
// tests/unit/scrimmageTeams.test.js
import { describe, it, expect } from "vitest";
import { isGameFrozen } from "@/lib/scrimmageTeams.js";

describe("isGameFrozen", () => {
  it("freezes a game in the past", () => expect(isGameFrozen({ past: true, hasCheckins: false })).toBe(true));
  it("freezes a game that has check-ins", () => expect(isGameFrozen({ past: false, hasCheckins: true })).toBe(true));
  it("leaves an upcoming, un-checked-in game open", () => expect(isGameFrozen({ past: false, hasCheckins: false })).toBe(false));
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run tests/unit/scrimmageTeams.test.js`
Expected: FAIL — `isGameFrozen` is not exported.

- [ ] **Step 3: Implement `isGameFrozen` and `applyAllMatchups`**

Append to `src/lib/scrimmageTeams.js`:

```javascript
// A game is "frozen" once it's been played — its date has passed, or players
// have checked in. Frozen games are never re-resolved, so a team change can't
// disturb a game that already happened (scores are athlete-anchored regardless).
export function isGameFrozen({ past, hasCheckins }) {
  return !!(past || hasCheckins);
}

// Resolve every stored matchup label into that game's roster — but ONLY for
// un-played games. Called by the Teams tab's "Apply to schedule". Returns
// { applied, skipped }. Best-effort/resilient pre-migration.
export async function applyAllMatchups(catId) {
  let rows;
  try {
    rows = await sql`
      SELECT id, session_number, group_number, matchup, (scheduled_date < CURRENT_DATE) AS past
      FROM evaluation_schedule
      WHERE age_category_id = ${catId} AND matchup IS NOT NULL AND status <> 'cancelled'`;
  } catch { return { applied: 0, skipped: 0 }; }
  let applied = 0, skipped = 0;
  for (const r of rows) {
    let hasCheckins = false;
    try { const c = await sql`SELECT 1 FROM player_checkins WHERE schedule_id = ${r.id} LIMIT 1`; hasCheckins = c.length > 0; } catch { /* table optional */ }
    if (isGameFrozen({ past: r.past, hasCheckins })) { skipped++; continue; }
    const teams = await resolveMatchupTeams(catId, r.matchup);
    if (teams.length) { await assignMatchupRoster(catId, r.session_number, r.group_number, teams); applied++; }
    else skipped++;
  }
  return { applied, skipped };
}
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `npx vitest run tests/unit/scrimmageTeams.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scrimmageTeams.js tests/unit/scrimmageTeams.test.js
git commit -m "feat(teams): applyAllMatchups resolves only un-played games (isGameFrozen)"
```

---

### Task 3: `apply_matchups` route action + "Apply to schedule" button

**Files:**
- Modify: `src/app/api/categories/[catId]/scrimmage-teams/route.js` (import + new action)
- Modify: `src/components/ScrimmageTeams.jsx` (button)

- [ ] **Step 1: Add the route action**

In `src/app/api/categories/[catId]/scrimmage-teams/route.js`, update the import to include `applyAllMatchups`:

```javascript
import { getScrimmageTeams, createTeams, seedTeams, moveAthlete, applyAllMatchups } from "@/lib/scrimmageTeams";
```

(Match the existing import line's names; add `applyAllMatchups`.) Then in POST, before the final `return NextResponse.json({ error: "Unknown action" }...`, add:

```javascript
    if (body.action === "apply_matchups") {
      const r = await applyAllMatchups(params.catId);
      return NextResponse.json({ success: true, ...r });
    }
```

- [ ] **Step 2: Add the "Apply to schedule" button in ScrimmageTeams**

In `src/components/ScrimmageTeams.jsx`, add local state for the apply result. After `const [drag, setDrag] = useState(null);` add:

```javascript
  const [applied, setApplied] = useState(null);
```

Add an apply handler after the `post` function:

```javascript
  const applyMatchups = async () => {
    setBusy(true); setApplied(null);
    try {
      const res = await fetch(`/api/categories/${catId}/scrimmage-teams`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "apply_matchups" }) });
      const d = await res.json();
      setApplied(d);
    } catch {}
    setBusy(false);
  };
```

In the toolbar `<div>` (the one containing "Seed alphabetically"), add after the "Even split" button:

```javascript
        <button onClick={applyMatchups} disabled={busy} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-accent text-accent rounded-lg font-semibold hover:bg-accent-soft disabled:opacity-50">
          Apply to schedule
        </button>
        {applied && <span className="text-[11px] text-gray-500">Updated {applied.applied} upcoming game{applied.applied === 1 ? "" : "s"}{applied.skipped ? ` · ${applied.skipped} already played/skipped` : ""}.</span>}
```

- [ ] **Step 3: Manual verification**

Run `npm run build` and confirm it compiles.
Run: `npm run build`
Expected: build succeeds (no import/JSX errors).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/categories/[catId]/scrimmage-teams/route.js src/components/ScrimmageTeams.jsx
git commit -m "feat(teams): Apply-to-schedule button resolves matchups for upcoming games"
```

---

### Task 4: Teams tab on the category dashboard (Tournament only)

**Files:**
- Modify: `src/components/CategoryDashboard.jsx` (tabs array ~313-319; move Assign-Teams block ~857-867 into a tab)

- [ ] **Step 1: Add a conditional "Teams" tab**

Replace the tabs array (lines ~313-319):

```javascript
const tabs = [
  { id: "rankings", label: "Rankings", icon: BarChart3 },
  { id: "schedule", label: "Schedule", icon: Calendar },
  { id: "analysis", label: "Analysis", icon: FileText },
  { id: "athletes", label: "Athletes", icon: Users },
  { id: "settings", label: "Settings", icon: Settings },
];
```

with:

```javascript
const tabs = [
  { id: "rankings", label: "Rankings", icon: BarChart3 },
  { id: "schedule", label: "Schedule", icon: Calendar },
  ...(category?.eval_format === "round_robin" ? [{ id: "teams", label: "Teams", icon: Users }] : []),
  { id: "analysis", label: "Analysis", icon: FileText },
  { id: "athletes", label: "Athletes", icon: Users },
  { id: "settings", label: "Settings", icon: Settings },
];
```

- [ ] **Step 2: Move the Assign-Teams block out of the schedule tab into the Teams tab**

Delete the existing round-robin block in the schedule tab (lines ~857-867):

```javascript
{category?.eval_format === "round_robin" && (
  <details className="bg-white border border-gray-200 rounded-xl overflow-hidden" open>
    <summary className="px-4 py-3 cursor-pointer text-sm font-semibold text-ink flex items-center gap-2 select-none">
      <Users size={15} className="text-accent" /> Assign Teams
      <span className="text-xs font-normal text-gray-400">— round-robin: seed &amp; drag before Session 1</span>
    </summary>
    <div className="px-4 pb-4 border-t border-gray-100 pt-4">
      <ScrimmageTeams catId={catId} />
    </div>
  </details>
)}
```

Add a Teams tab section. Place this next to the other `{activeTab === "..."}` blocks (e.g. right after the schedule tab's closing block):

```javascript
{activeTab === "teams" && category?.eval_format === "round_robin" && (
  <div className="space-y-4">
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h3 className="font-display text-lg font-extrabold tracking-tight text-ink flex items-center gap-2"><Users size={18} className="text-accent" /> Teams</h3>
      <p className="text-sm text-gray-500 mt-1">Assign players to teams (A/B/C/D). Seed then drag to adjust. Click <b>Apply to schedule</b> to fill upcoming matchup games — already-played games are never changed, and moving a player never affects their past scores.</p>
    </div>
    <ScrimmageTeams catId={catId} />
  </div>
)}
```

- [ ] **Step 3: Manual verification**

Run: `npm run build`
Expected: build succeeds. (Manual: a `round_robin` category shows a Teams tab; a standard category does not.)

- [ ] **Step 4: Commit**

```bash
git add src/components/CategoryDashboard.jsx
git commit -m "feat(dashboard): first-class Teams tab for Tournament categories"
```

---

### Task 5: Unified bulk template + testable column parser

**Files:**
- Create: `src/lib/bulkSchedule.js` (pure parser, moved+extended from parse route)
- Modify: `src/app/api/templates/route.js` (bulk-schedule columns + explainer)
- Modify: `src/app/api/organizations/[orgId]/bulk-onboard/parse/route.js` (use the lib)
- Test: `tests/unit/bulkSchedule.test.js`

- [ ] **Step 1: Write the failing parser unit test**

```javascript
// tests/unit/bulkSchedule.test.js
import { describe, it, expect } from "vitest";
import { scheduleFromColumns } from "@/lib/bulkSchedule.js";

const grid = [
  ["# explainer row"],
  ["Division","Format","Session #","Group/Matchup","Type","Date","Start Time","End Time","Location","Player Evaluators","Goalie Evaluators"],
  ["U11 AA","Tournament","1","A vs B","","2026-09-19","17:30","18:30","Rink A","4","1"],
  ["U13 House","Standard","1","2","Scrimmage","2026-09-09","18:00","19:15","Rink B","4","0"],
];

describe("scheduleFromColumns — format-aware", () => {
  const rows = scheduleFromColumns(grid);
  it("parses a Tournament row's matchup and format", () => {
    const t = rows.find(r => r.division === "U11 AA");
    expect(t.eval_format).toBe("round_robin");
    expect(t.matchup).toBe("A vs B");
    expect(t.session_number).toBe(1);
    expect(t.group_number).toBe(null);
    expect(t.date).toBe("2026-09-19");
  });
  it("parses a Standard row's group number", () => {
    const s = rows.find(r => r.division === "U13 House");
    expect(s.eval_format).toBe("standard");
    expect(s.matchup).toBe(null);
    expect(s.group_number).toBe(2);
    expect(s.session_number).toBe(1);
  });
  it("returns null when there is no Division column", () => {
    expect(scheduleFromColumns([["Date","Time"],["2026-01-01","09:00"]])).toBe(null);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run tests/unit/bulkSchedule.test.js`
Expected: FAIL — module `@/lib/bulkSchedule.js` not found.

- [ ] **Step 3: Create the parser lib**

Create `src/lib/bulkSchedule.js`:

```javascript
// Deterministic, format-aware parse of the all-association bulk schedule template.
// Header row must contain "division" and "date". Returns rows in the shape the
// bulk-onboard commit expects, or null when there's no Division column (caller
// then falls back to the AI normalizer). Pure — no DB, unit-testable.

const isTourn = (v) => /tourn|round|robin/.test(String(v || "").toLowerCase());

const to24 = (t) => { const s = String(t || "").trim(); if (!s) return null; const m = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i); if (!m) { const m2 = s.match(/^(\d{1,2}):(\d{2})/); return m2 ? `${m2[1].padStart(2, "0")}:${m2[2]}` : null; } let h = parseInt(m[1]); const ap = m[3] ? m[3].toUpperCase() : null; if (ap === "PM" && h < 12) h += 12; if (ap === "AM" && h === 12) h = 0; return `${String(h).padStart(2, "0")}:${m[2]}`; };
const toISO = (d) => { const s = String(d || "").trim(); let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0]; m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`; m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/); if (m) return `20${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`; return null; };
const stype = (t) => { const s = String(t || "").toLowerCase(); if (s.includes("test") || s.includes("time trial")) return "testing"; if (s.includes("goalie")) return "goalie_skills"; if (s.includes("scrim") || s.includes("game")) return "scrimmage"; if (s.includes("skill") || s.includes("pre")) return "skills"; return "scrimmage"; };

export function mapColumns(H) {
  const col = (names) => H.findIndex(h => names.some(n => h.includes(n)));
  return {
    div: col(["division"]),
    fmt: col(["format"]),
    sess: H.findIndex(h => h.includes("session") && (h.includes("#") || h.includes("number")) && !h.includes("type")),
    gm: H.findIndex(h => h.includes("matchup") || h.includes("group")),
    type: col(["session type", "type"]),
    date: col(["date"]), start: col(["start"]), end: col(["end"]),
    loc: col(["location", "rink"]), pe: col(["player eval"]), ge: col(["goalie eval"]),
  };
}

export function scheduleFromColumns(grid) {
  let hi = -1, H = [];
  for (let i = 0; i < Math.min(grid.length, 20); i++) {
    const low = (grid[i] || []).map(c => String(c).toLowerCase().trim());
    if (low.some(c => c.includes("division")) && low.some(c => c.includes("date"))) { hi = i; H = low; break; }
  }
  if (hi < 0) return null;
  const ci = mapColumns(H);
  const rows = [];
  for (let i = hi + 1; i < grid.length; i++) {
    const r = grid[i] || [];
    const division = ci.div >= 0 ? String(r[ci.div] || "").trim() : "";
    const date = toISO(ci.date >= 0 ? r[ci.date] : "");
    if (!division && !date) continue;
    const eval_format = ci.fmt >= 0 && isTourn(r[ci.fmt]) ? "round_robin" : "standard";
    const gmVal = ci.gm >= 0 ? String(r[ci.gm] || "").trim() : "";
    const isT = eval_format === "round_robin";
    const session_number = ci.sess >= 0 ? (parseInt(r[ci.sess]) || null) : null;
    rows.push({
      raw_label: division, age_group: null, division,
      eval_format, session_number,
      group_number: isT ? null : (parseInt(gmVal) || null),
      matchup: isT ? (gmVal || null) : null,
      session_type: stype(ci.type >= 0 ? r[ci.type] : ""),
      date, start_time: to24(ci.start >= 0 ? r[ci.start] : ""), end_time: to24(ci.end >= 0 ? r[ci.end] : ""),
      location: ci.loc >= 0 ? String(r[ci.loc] || "").trim() || null : null,
      player_evaluators: ci.pe >= 0 ? r[ci.pe] : null, goalie_evaluators: ci.ge >= 0 ? r[ci.ge] : null,
    });
  }
  return rows;
}
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `npx vitest run tests/unit/bulkSchedule.test.js`
Expected: PASS.

- [ ] **Step 5: Use the lib in the parse route (delete the inline copy)**

In `src/app/api/organizations/[orgId]/bulk-onboard/parse/route.js`:
- Add import near the other imports: `import { scheduleFromColumns } from "@/lib/bulkSchedule";`
- Delete the inline `function scheduleFromColumns(grid) { ... }` (and the now-unused inline `to24`/`toISO`/`stype` helpers only if they are not referenced elsewhere in the file — search the file; `fileToGrid` stays). Leave the rest of the route untouched: it already spreads each row (`{ ...r, divisionKey }`), so the new `eval_format`/`session_number`/`group_number`/`matchup` fields flow through automatically.

- [ ] **Step 6: Rewrite the bulk-schedule template**

In `src/app/api/templates/route.js`, replace the `if (type === "bulk-schedule")` block's `csv` array with:

```javascript
    const csv = [
      "# STANDARD (House): one pool; Session # = wave; Group/Matchup = group number (1,2,3); Type = Testing/Scrimmage/Goalie Skills.",
      "# TOURNAMENT (Elite or House): set teams A/B/C/D play matchups; Session # = game; Group/Matchup = 'A vs B'; leave Type blank. Assign teams later in the dashboard Teams tab.",
      "Division,Format,Session #,Group/Matchup,Type,Date,Start Time,End Time,Location,Player Evaluators,Goalie Evaluators",
      "U11 AA,Tournament,1,A vs B,,2026-09-19,17:30,18:30,Rink A,4,1",
      "U11 AA,Tournament,2,C vs D,,2026-09-20,18:15,19:15,Rink A,4,1",
      "U13 House,Standard,1,1,Testing,2026-09-09,18:00,19:00,Rink B,0,0",
      "U13 House,Standard,1,2,Scrimmage,2026-09-09,19:15,20:30,Rink B,4,0",
    ].join("\n");
```

(The `#` lines carry neither "division" nor "date", so `scheduleFromColumns` skips them when finding the header.)

- [ ] **Step 7: Run the parser test + build**

Run: `npx vitest run tests/unit/bulkSchedule.test.js && npm run build`
Expected: PASS, then build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/lib/bulkSchedule.js tests/unit/bulkSchedule.test.js src/app/api/templates/route.js src/app/api/organizations/[orgId]/bulk-onboard/parse/route.js
git commit -m "feat(bulk): format-aware bulk template + testable schedule parser"
```

---

### Task 6: Bulk commit sets format, honors Session#/Group#, stores matchup

**Files:**
- Modify: `src/app/api/organizations/[orgId]/bulk-onboard/commit/route.js` (category create/reuse ~87-99; schedule loop ~119-133)
- Test: `tests/integration/bulk-commit-format.itest.js`

- [ ] **Step 1: Write the failing integration test**

```javascript
// tests/integration/bulk-commit-format.itest.js
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ getSession: vi.fn(async () => ({ email: "b@local", role: "super_admin", name: "B" })), getAppUserId: vi.fn(async () => null) }));
vi.mock("@/lib/authorize", () => ({ authorizeOrgAccess: vi.fn(async () => ({ authorized: true })) }));

const sql = (await import("@/lib/db")).default;
const { POST } = await import("@/app/api/organizations/[orgId]/bulk-onboard/commit/route");

const state = { org: null };
beforeAll(async () => { [state.org] = await sql`INSERT INTO organizations (name, type, contact_email) VALUES ('BC Org','association','bc@local') RETURNING id`; }, 60000);
afterAll(async () => {
  if (!state.org?.id) return;
  const cats = await sql`SELECT id FROM age_categories WHERE organization_id = ${state.org.id}`;
  for (const c of cats) { await sql`DELETE FROM evaluation_schedule WHERE age_category_id = ${c.id}`; await sql`DELETE FROM category_sessions WHERE age_category_id = ${c.id}`; await sql`DELETE FROM scoring_categories WHERE age_category_id = ${c.id}`; await sql`DELETE FROM athletes WHERE age_category_id = ${c.id}`; }
  await sql`DELETE FROM age_categories WHERE organization_id = ${state.org.id}`;
  await sql`DELETE FROM organizations WHERE id = ${state.org.id}`;
}, 60000);

describe("bulk commit — format aware", () => {
  it("creates a Tournament category, stores matchup + honors session/group", async () => {
    const scheduleRows = [
      { divisionKey: "U11 AA", eval_format: "round_robin", session_number: 1, group_number: null, matchup: "A vs B", session_type: "scrimmage", date: "2026-09-19", start_time: "17:30", end_time: "18:30", location: "Rink A", player_evaluators: 4, goalie_evaluators: 1 },
    ];
    const decisions = [{ key: "U11 AA", action: "create", name: "U11 AA" }];
    const req = new Request(`http://t/api/organizations/${state.org.id}/bulk-onboard/commit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decisions, scheduleRows, athletes: [] }) });
    const res = await POST(req, { params: { orgId: String(state.org.id) } });
    const d = await res.json();
    expect(d.success).toBe(true);
    const [cat] = await sql`SELECT id, eval_format FROM age_categories WHERE organization_id = ${state.org.id} AND name = 'U11 AA'`;
    expect(cat.eval_format).toBe("round_robin");
    const [row] = await sql`SELECT session_number, group_number, matchup FROM evaluation_schedule WHERE age_category_id = ${cat.id}`;
    expect(row.matchup).toBe("A vs B");
    expect(row.session_number).toBe(1);
  }, 60000);
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run -c vitest.integration.config.js tests/integration/bulk-commit-format.itest.js`
Expected: FAIL — `eval_format` not set / `matchup` null.

- [ ] **Step 3: Set eval_format when resolving the category**

In the decisions loop, immediately after `const keyAthletes = athletes.filter(a => a.divisionKey === dec.key);` add:

```javascript
      const declaredTournament = keyRows.some(r => r.eval_format === "round_robin");
      const declaredFormat = keyRows.some(r => r.eval_format) ? (declaredTournament ? "round_robin" : "standard") : null;
```

In the `else` (create) branch, after `summary.categoriesCreated++;` add:

```javascript
        if (declaredFormat) { try { await sql`UPDATE age_categories SET eval_format = ${declaredFormat} WHERE id = ${catId}`; } catch { /* pre-migration */ } }
```

In the `if (dec.action === "existing" ...)` branch, after `summary.categoriesReused++;` add the same guard:

```javascript
        if (declaredFormat) { try { await sql`UPDATE age_categories SET eval_format = ${declaredFormat} WHERE id = ${catId}`; } catch { /* pre-migration */ } }
```

- [ ] **Step 4: Honor explicit Session#/Group# and store matchup in the schedule loop**

Replace the schedule insert loop body. Change:

```javascript
      for (const r of sorted) {
        const sNum = sessionForRow(r);
        groupCounter[sNum] = (groupCounter[sNum] || 0) + 1;
```

to:

```javascript
      for (const r of sorted) {
        const sNum = (r.session_number != null && r.session_number !== "") ? (parseInt(r.session_number) || sessionForRow(r)) : sessionForRow(r);
        let grpNum;
        if (r.group_number != null && r.group_number !== "") { grpNum = parseInt(r.group_number) || 1; }
        else { groupCounter[sNum] = (groupCounter[sNum] || 0) + 1; grpNum = groupCounter[sNum]; }
```

Then in that loop's INSERT, replace `${groupCounter[sNum]}` with `${grpNum}`, and add the matchup column. Change the INSERT to:

```javascript
        await sql`INSERT INTO evaluation_schedule (age_category_id, session_number, group_number, scheduled_date, day_of_week, start_time, end_time, location, checkin_code, evaluators_required, goalie_evaluators_required, matchup, status)
          VALUES (${catId}, ${sNum}, ${grpNum}, ${r.date}, ${dow}, ${r.start_time || null}, ${r.end_time || null}, ${r.location || null}, ${code()}, ${evalReq}, ${ge}, ${r.matchup || null}, 'scheduled')`;
```

(Matchup is stored but NOT resolved here — teams are assigned later via the Teams tab.)

- [ ] **Step 5: Run the test — expect PASS**

Run: `npx vitest run -c vitest.integration.config.js tests/integration/bulk-commit-format.itest.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/organizations/[orgId]/bulk-onboard/commit/route.js tests/integration/bulk-commit-format.itest.js
git commit -m "feat(bulk): commit sets eval_format, honors Session#/Group#, stores matchup"
```

---

### Task 7: Rename to "Tournament"/"Standard" in the wizard + dashboard

**Files:**
- Modify: `src/app/association/dashboard/category/[catId]/setup/page.jsx` (format block ~694-711)
- Modify: `src/components/CategoryDashboard.jsx` (template link ~828)
- Modify: `src/components/ScrimmageTeams.jsx` (copy)

- [ ] **Step 1: Reword the wizard format gate**

In `setup/page.jsx`, replace the format `<div>` block (the `<h2>Evaluation format</h2>` through its closing before `<SessionsStep ...>`) with:

```javascript
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-1">Choose the evaluation format</h2>
                <p className="text-sm text-gray-500 mb-4">This shapes how {catName || "this age group"} is run. Pick one:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { v: "standard", t: "Standard (House)", d: "One pool per age group. Players skate in groups/waves and move up or down based on performance. Ranking-based." },
                    { v: "round_robin", t: "Tournament (Elite, or House)", d: "Players split into set teams (A/B/C/D) that play matchup games. Every player is scored every game they skate; missing a game doesn't hurt them. Teams are assigned in the dashboard." },
                  ].map(o => (
                    <button key={o.v} type="button" onClick={() => setEvalFormat(o.v)} className={`text-left p-4 rounded-xl border-2 transition-all ${evalFormat === o.v ? "border-accent bg-accent-soft" : "border-gray-200 hover:border-gray-300"}`}>
                      <div className="flex items-center justify-between mb-1"><span className="font-semibold text-gray-800">{o.t}</span>{evalFormat === o.v && <Check size={16} className="text-accent" />}</div>
                      <p className="text-xs text-gray-500">{o.d}</p>
                    </button>
                  ))}
                </div>
                {evalFormat === "round_robin" && (
                  <p className="text-xs text-accent mt-3">After launch, a <b>Teams</b> tab appears on the category — assign teams (A/B/C/D) and drag to adjust, then Apply to fill the matchup games.</p>
                )}
              </div>
```

- [ ] **Step 2: Reword the dashboard template link**

In `CategoryDashboard.jsx` line ~828, change the trailing label `{category?.eval_format === "round_robin" ? " (matchups)" : ""}` — leave as-is (still accurate). Change the summary/label wording only where it says "round-robin". If the Assign-Teams `<details>` was removed in Task 4, nothing to change here; otherwise update its text "round-robin" → "Tournament".

- [ ] **Step 3: Reword ScrimmageTeams helper copy**

In `ScrimmageTeams.jsx`, update the top comment and any visible "round-robin" text to "Tournament". The visible hint `Then drag players between teams to adjust.` stays. Change the file's lead comment `Only rendered when the category's eval_format = 'round_robin'.` → `Rendered on the Teams tab of a Tournament category (eval_format = 'round_robin').`

- [ ] **Step 4: Build + verify**

Run: `npm run build`
Expected: build succeeds. Manual: wizard shows "Standard (House)" / "Tournament (Elite, or House)".

- [ ] **Step 5: Commit**

```bash
git add src/app/association/dashboard/category/[catId]/setup/page.jsx src/components/CategoryDashboard.jsx src/components/ScrimmageTeams.jsx
git commit -m "feat(ui): rename round-robin to Tournament in wizard + dashboard"
```

---

## Out of scope for this plan (noted, not built here)

- Pre-commit UI badge in the bulk-onboard screen for a division with mixed Format rows. The commit uses "any Tournament row ⇒ round_robin"; the template's explainer rows guide correct filling. A dedicated conflict badge can be added once the bulk-onboard React component is mapped.
- Tournament-specific session weighting in bulk (session weights still come from `deriveSessions`). Exotic multi-game-per-date layouts can be tuned later.

## Self-review notes

- Spec §1 (template) → Task 5. §2 (format per division) → Task 6. §3 (matchup persistence) → Tasks 1, 6. §4 (Teams tab, movable, score-safe via freeze) → Tasks 2, 3, 4. §5 (wizard format fork) → Task 7. §6 (naming) → Task 7.
- Function names are consistent across tasks: `isGameFrozen`, `applyAllMatchups`, `scheduleFromColumns`, `mapColumns`.
- `evaluation_schedule.matchup` migration already applied by the user.
