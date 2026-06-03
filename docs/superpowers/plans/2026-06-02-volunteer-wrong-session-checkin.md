# Volunteer Wrong-Session Check-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a volunteer check any physically-present player into their session — reusing the player's existing identity if one exists — without ever creating a duplicate athlete, and tighten multi-volunteer sync.

**Architecture:** Two new POST actions on the existing check-in API route (`find_existing`, `add_existing`), both behind the existing `authorizeCheckin` gate. The Add form in the check-in page becomes search-first: typing a name surfaces matching roster athletes with a "Check in here" button (reuses `athlete_id`), falling back to "Add new player" only when there's no match. Poll interval drops 15s→5s.

**Tech Stack:** Next.js App Router (route handlers), `@neondatabase/serverless` tagged-template SQL via `@/lib/db`, React + `@tanstack/react-query`, Vitest with mocked `sql`/`getSession`.

**Spec:** `docs/superpowers/specs/2026-06-02-volunteer-wrong-session-checkin-design.md`

---

## File Structure

- **Modify** `src/app/api/checkin/[scheduleId]/route.js` — add `find_existing` and `add_existing` action branches inside the existing `POST` handler, before the `"Unknown action"` fallthrough (currently `:291`). Reuse the existing `authorizeCheckin` (`:27`).
- **Modify** `src/app/checkin/[scheduleId]/page.jsx` — search-first Add form (`:152-180`), relabel primary button, add `find_existing` lookup + `add_existing` call, change `refetchInterval` (`:37`).
- **Create** `tests/unit/checkin-actions.test.js` — unit tests for the category guard, happy path, and min-query short-circuit.

### Key facts the implementation depends on (verified against current code)

- `authorizeCheckin(scheduleId)` returns `{ ok: true, ageCategoryId }` on success or `{ ok: false, status, error }` (`route.js:27-53`). Use `auth.ageCategoryId` as the source of truth for the schedule's category — no extra query needed.
- The schedule's session/group come from `evaluation_schedule` columns `session_number`, `group_number` (`group_number` may be null → treat as `1`), matching `add_player` (`route.js:248-271`).
- Session group lookup: `session_groups` keyed by `(age_category_id, session_number, group_number)` (`route.js:265-271`).
- Group membership row: `player_group_assignments (athlete_id, session_group_id, display_order)` with `ON CONFLICT DO NOTHING` (`route.js:273-277`).
- Check-in row upsert: `player_checkins` unique key is `(athlete_id, schedule_id)` (`route.js:283-285`); a `checkin_sessions` row already exists (GET creates it, `route.js:74-84`) and its id is fetched via `SELECT id FROM checkin_sessions WHERE schedule_id = ...`.
- `athletes` has **no** `jersey_number` column — jersey lives on `player_checkins`. Match display uses name/position only.

---

## Task 1: `add_existing` action + category guard (API)

**Files:**
- Modify: `src/app/api/checkin/[scheduleId]/route.js` (insert new branch before `:291` `return NextResponse.json({ error: "Unknown action" }...`)
- Test: `tests/unit/checkin-actions.test.js` (create)

- [ ] **Step 1: Write the failing guard test**

Create `tests/unit/checkin-actions.test.js`:

```javascript
// Unit tests for the check-in route's new add_existing / find_existing actions.
// sql + getSession + next/headers are mocked so no live DB is needed, mirroring
// tests/unit/authz_idor.test.js.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
  signToken: vi.fn(),
  verifyToken: vi.fn(),
  getCurrentUser: vi.fn(),
  getAppUserId: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined }) }));

process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-secret-for-checkin-suite";

import sql from "@/lib/db";
import { getSession } from "@/lib/auth";

// A super_admin session makes authorizeCheckin pass with two sql round-trips:
//   call 1: SELECT age_category_id FROM evaluation_schedule  (authorizeCheckin)
//   call 2: SELECT organization_id FROM age_categories       (authorizeCategoryAccess, super_admin branch)
function mockAuthPass(ageCategoryId = "catX") {
  getSession.mockResolvedValue({ email: "root@test", role: "super_admin" });
  sql.mockResolvedValueOnce([{ age_category_id: ageCategoryId }]); // call 1
  sql.mockResolvedValueOnce([{ organization_id: "orgX" }]);        // call 2
}

function makeReq(body) {
  return new Request("http://test/api/checkin/sched1", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("add_existing", () => {
  it("rejects an athlete from a different age category with 403 and no writes", async () => {
    mockAuthPass("catX");
    // athlete lookup returns a DIFFERENT category → guard must fire
    sql.mockResolvedValueOnce([{ id: "ath9", age_category_id: "catOTHER" }]); // call 3

    const { POST } = await import("@/app/api/checkin/[scheduleId]/route");
    const res = await POST(makeReq({ action: "add_existing", athlete_id: "ath9" }), {
      params: { scheduleId: "sched1" },
    });

    expect(res.status).toBe(403);
    // exactly 3 sql calls: auth(2) + athlete lookup(1). No insert/upsert ran.
    expect(sql.mock.calls.length).toBe(3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/checkin-actions.test.js -t "rejects an athlete from a different"`
Expected: FAIL — current route returns `{ error: "Unknown action" }` with status 400 (not 403), since `add_existing` doesn't exist yet.

- [ ] **Step 3: Implement the `add_existing` branch**

In `src/app/api/checkin/[scheduleId]/route.js`, insert this branch immediately before the final `return NextResponse.json({ error: "Unknown action" }, { status: 400 });` (currently `:291`):

```javascript
    if (action === "add_existing") {
      if (!athlete_id) return NextResponse.json({ error: "athlete_id required" }, { status: 400 });

      // Guard: the athlete must belong to this schedule's category. Prevents
      // pulling an arbitrary athlete from another org/category via a guessed id.
      const ath = await sql`SELECT id, age_category_id FROM athletes WHERE id = ${athlete_id}`;
      if (!ath.length) return NextResponse.json({ error: "Athlete not found" }, { status: 404 });
      if (ath[0].age_category_id !== auth.ageCategoryId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const schedInfo = await sql`
        SELECT session_number, group_number FROM evaluation_schedule WHERE id = ${scheduleId}
      `;
      const sched = schedInfo[0] || {};

      // Attach to this session's group if one exists (mirrors add_player).
      const sessionGroup = await sql`
        SELECT id FROM session_groups
        WHERE age_category_id = ${auth.ageCategoryId}
          AND session_number = ${sched.session_number}
          AND group_number = ${sched.group_number || 1}
        LIMIT 1
      `;
      if (sessionGroup.length) {
        await sql`
          INSERT INTO player_group_assignments (athlete_id, session_group_id, display_order)
          VALUES (${athlete_id}, ${sessionGroup[0].id}, 99)
          ON CONFLICT DO NOTHING
        `;
      }

      // Check them into THIS session, reusing the existing athlete_id.
      const cs = await sql`SELECT id FROM checkin_sessions WHERE schedule_id = ${scheduleId}`;
      await sql`
        INSERT INTO player_checkins (athlete_id, schedule_id, checkin_session_id, jersey_number, team_color, checked_in, checked_in_at)
        VALUES (${athlete_id}, ${scheduleId}, ${cs[0]?.id}, ${jersey_number || null}, ${team_color || 'White'}, true, NOW())
        ON CONFLICT (athlete_id, schedule_id) DO UPDATE SET
          checked_in = true,
          checked_in_at = NOW(),
          jersey_number = COALESCE(${jersey_number || null}, player_checkins.jersey_number),
          team_color = COALESCE(${team_color || null}, player_checkins.team_color)
      `;

      return NextResponse.json({ success: true });
    }
```

Note: `athlete_id`, `jersey_number`, `team_color` are already destructured from `body` at `route.js:185`. `auth` is already in scope from `:181`.

- [ ] **Step 4: Run the guard test to verify it passes**

Run: `npx vitest run tests/unit/checkin-actions.test.js -t "rejects an athlete from a different"`
Expected: PASS.

- [ ] **Step 5: Add the happy-path test**

Append inside the `describe("add_existing", ...)` block in `tests/unit/checkin-actions.test.js`:

```javascript
  it("checks in an existing same-category athlete and upserts player_checkins", async () => {
    mockAuthPass("catX");
    sql.mockResolvedValueOnce([{ id: "ath9", age_category_id: "catX" }]); // athlete lookup (match)
    sql.mockResolvedValueOnce([{ session_number: 1, group_number: 1 }]);  // schedInfo
    sql.mockResolvedValueOnce([{ id: "sg1" }]);                            // session_groups
    sql.mockResolvedValueOnce([]);                                        // player_group_assignments insert
    sql.mockResolvedValueOnce([{ id: "cs1" }]);                           // checkin_sessions
    sql.mockResolvedValueOnce([]);                                        // player_checkins upsert

    const { POST } = await import("@/app/api/checkin/[scheduleId]/route");
    const res = await POST(makeReq({ action: "add_existing", athlete_id: "ath9" }), {
      params: { scheduleId: "sched1" },
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    // The player_checkins upsert must have run with checked_in = true.
    const ran = sql.mock.calls.map(c => c[0].join("?"));
    expect(ran.some(s => s.includes("INTO player_checkins") && s.includes("checked_in"))).toBe(true);
  });
```

- [ ] **Step 6: Run both add_existing tests**

Run: `npx vitest run tests/unit/checkin-actions.test.js -t "add_existing"`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add tests/unit/checkin-actions.test.js "src/app/api/checkin/[scheduleId]/route.js"
git commit -m "feat(checkin): add_existing action to re-check-in a rostered athlete without duplicating"
```

---

## Task 2: `find_existing` action (API)

**Files:**
- Modify: `src/app/api/checkin/[scheduleId]/route.js` (insert branch before the `add_existing` branch)
- Test: `tests/unit/checkin-actions.test.js`

- [ ] **Step 1: Write the failing min-query test**

Append a new describe block in `tests/unit/checkin-actions.test.js`:

```javascript
describe("find_existing", () => {
  it("returns an empty list and runs no roster query for queries under 2 chars", async () => {
    mockAuthPass("catX");

    const { POST } = await import("@/app/api/checkin/[scheduleId]/route");
    const res = await POST(makeReq({ action: "find_existing", query: "a" }), {
      params: { scheduleId: "sched1" },
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ matches: [] });
    // Only the 2 auth calls ran — no ILIKE roster scan.
    const ran = sql.mock.calls.map(c => c[0].join("?"));
    expect(ran.some(s => s.includes("ILIKE"))).toBe(false);
    expect(sql.mock.calls.length).toBe(2);
  });

  it("returns roster matches in the same category for a valid query", async () => {
    mockAuthPass("catX");
    sql.mockResolvedValueOnce([{ session_number: 1, group_number: 1 }]); // schedInfo
    sql.mockResolvedValueOnce([                                          // roster ILIKE scan
      { id: "ath42", first_name: "Sarah", last_name: "Chen", position: "F", session_number: 2, group_number: 1 },
    ]);

    const { POST } = await import("@/app/api/checkin/[scheduleId]/route");
    const res = await POST(makeReq({ action: "find_existing", query: "Sar" }), {
      params: { scheduleId: "sched1" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.matches).toHaveLength(1);
    expect(body.matches[0]).toMatchObject({ id: "ath42", last_name: "Chen", session_number: 2 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/checkin-actions.test.js -t "find_existing"`
Expected: FAIL — action unknown, returns 400.

- [ ] **Step 3: Implement the `find_existing` branch**

In `src/app/api/checkin/[scheduleId]/route.js`, insert immediately before the `add_existing` branch from Task 1:

```javascript
    if (action === "find_existing") {
      const q = (body.query || "").trim();
      if (q.length < 2) return NextResponse.json({ matches: [] });

      const schedInfo = await sql`
        SELECT session_number, group_number FROM evaluation_schedule WHERE id = ${scheduleId}
      `;
      const sched = schedInfo[0] || {};
      const like = `%${q}%`;

      // Athletes in this category whose name matches, excluding any already
      // assigned to THIS session's group (they're already in the main list).
      const matches = await sql`
        SELECT a.id, a.first_name, a.last_name, a.position,
               sg.session_number, sg.group_number
        FROM athletes a
        LEFT JOIN player_group_assignments pga ON pga.athlete_id = a.id
        LEFT JOIN session_groups sg ON sg.id = pga.session_group_id
        WHERE a.age_category_id = ${auth.ageCategoryId}
          AND a.is_active = true
          AND (a.first_name ILIKE ${like}
               OR a.last_name ILIKE ${like}
               OR (a.first_name || ' ' || a.last_name) ILIKE ${like})
          AND NOT EXISTS (
            SELECT 1 FROM player_group_assignments pga2
            JOIN session_groups sg2 ON sg2.id = pga2.session_group_id
            WHERE pga2.athlete_id = a.id
              AND sg2.age_category_id = ${auth.ageCategoryId}
              AND sg2.session_number = ${sched.session_number}
              AND sg2.group_number = ${sched.group_number || 1}
          )
        ORDER BY a.last_name, a.first_name
        LIMIT 8
      `;

      return NextResponse.json({ matches });
    }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/checkin-actions.test.js -t "find_existing"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add tests/unit/checkin-actions.test.js "src/app/api/checkin/[scheduleId]/route.js"
git commit -m "feat(checkin): find_existing action to search the category roster"
```

---

## Task 3: Search-first Add form + instant refresh (UI)

**Files:**
- Modify: `src/app/checkin/[scheduleId]/page.jsx`

No new unit test (UI wiring against the two actions already covered). Verified by build + manual smoke in Task 4.

- [ ] **Step 1: Tighten the poll interval**

In `src/app/checkin/[scheduleId]/page.jsx`, change `:37`:

```javascript
    refetchInterval: 5000,
```

- [ ] **Step 2: Add lookup state and helpers**

Inside `CheckinPageInner`, after the existing `addForm` state (`:24`), add:

```javascript
  const [matches, setMatches] = useState([]);
  const [searching, setSearching] = useState(false);
```

After `quickCheckin` (`:60`), add the lookup + add-existing helpers:

```javascript
  // Debounced roster lookup as the volunteer types a name in the Add form.
  const lookupTimer = useRef(null);
  const runLookup = (first, last) => {
    const query = `${first} ${last}`.trim();
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    if (query.length < 2) { setMatches([]); return; }
    lookupTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/checkin/${scheduleId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "find_existing", query }),
        });
        const data = res.ok ? await res.json() : { matches: [] };
        setMatches(data.matches || []);
      } finally {
        setSearching(false);
      }
    }, 250);
  };

  const checkInExisting = async (athleteId) => {
    await doAction("add_existing", { athlete_id: athleteId });
    setAddForm({ first_name: "", last_name: "", jersey_number: "", team_color: "White" });
    setMatches([]);
  };
```

Add `useRef` to the React import at `:3`:

```javascript
import { useState, useRef, Suspense } from "react";
```

- [ ] **Step 3: Wire lookup into the name inputs and render matches**

Replace the Add Player block (`:152-180`) with:

```javascript
      {showAddPlayer && (
        <div className="max-w-2xl mx-auto px-4 pt-3">
          <div className="flex items-center gap-2 bg-green-900/30 border border-green-700/50 rounded-lg px-3 py-2">
            <input value={addForm.first_name}
              onChange={e => { const v = e.target.value; setAddForm(f => ({ ...f, first_name: v })); runLookup(v, addForm.last_name); }}
              placeholder="First *" className="w-24 bg-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none" autoFocus />
            <input value={addForm.last_name}
              onChange={e => { const v = e.target.value; setAddForm(f => ({ ...f, last_name: v })); runLookup(addForm.first_name, v); }}
              placeholder="Last *" className="w-24 bg-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none" />
            <input value={addForm.jersey_number} onChange={e => setAddForm(f => ({ ...f, jersey_number: e.target.value }))}
              placeholder="#" type="number" className="w-14 bg-gray-700 rounded px-2 py-1.5 text-sm text-white text-center focus:outline-none" />
            <button onClick={() => setAddForm(f => ({ ...f, team_color: f.team_color === "White" ? "Dark" : "White" }))}
              className={`px-2 py-1.5 rounded text-xs font-bold ${addForm.team_color === "Dark" ? "bg-gray-700 text-white" : "bg-white text-gray-900"}`}>
              {addForm.team_color === "Dark" ? "D" : "L"}
            </button>
            <button
              onClick={async () => {
                if (!addForm.first_name || !addForm.last_name) return;
                setAddLoading(true);
                await doAction("add_player", { ...addForm, jersey_number: parseInt(addForm.jersey_number) || null });
                setAddForm({ first_name: "", last_name: "", jersey_number: "", team_color: "White" });
                setMatches([]);
                setAddLoading(false);
              }}
              disabled={!addForm.first_name || !addForm.last_name || addLoading}
              className="px-3 py-1.5 bg-green-600 text-white rounded text-xs font-semibold disabled:opacity-40 whitespace-nowrap">
              {addLoading ? "..." : "Add new"}
            </button>
            <button onClick={() => { setShowAddPlayer(false); setMatches([]); }} className="text-gray-500 hover:text-white"><X size={14} /></button>
          </div>

          {/* Existing-roster matches — pick to check in without duplicating */}
          {matches.length > 0 && (
            <div className="mt-2 bg-gray-800 border border-gray-700 rounded-lg divide-y divide-gray-700/60">
              {matches.map(m => (
                <div key={m.id} className="flex items-center justify-between px-3 py-2">
                  <span className="text-sm text-white truncate">
                    {m.last_name}, {m.first_name}
                    <span className="text-xs text-gray-500 ml-2">
                      {m.position ? `${m.position} · ` : ""}
                      {m.session_number ? `S${m.session_number}·G${m.group_number || 1}` : "unassigned"}
                    </span>
                  </span>
                  <button onClick={() => checkInExisting(m.id)}
                    className="px-3 py-1.5 bg-[#1A6BFF] text-white rounded text-xs font-semibold whitespace-nowrap">Check in here</button>
                </div>
              ))}
            </div>
          )}
          {searching && matches.length === 0 && (addForm.first_name + addForm.last_name).trim().length >= 2 && (
            <div className="mt-2 px-3 py-2 text-xs text-gray-500">Searching roster…</div>
          )}
        </div>
      )}
```

- [ ] **Step 4: Verify the production build compiles**

Run: `npm run build`
Expected: build completes with no errors in `checkin/[scheduleId]`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/checkin/[scheduleId]/page.jsx"
git commit -m "feat(checkin): search-first Add form (reuse existing athletes) + 5s refresh"
```

---

## Task 4: Full verification & deploy

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: all suites pass, including the new `tests/unit/checkin-actions.test.js` (4 new tests). Prior count was 84 → expect 88.

- [ ] **Step 2: Push to main (auto-deploys to production)**

Only after the user confirms they want it live (this deploys to sidelinestar.com):

```bash
git push origin main
```

- [ ] **Step 3: Confirm the production deploy reaches Ready**

Run: `vercel ls` then `vercel inspect <newest-production-url>` until status is `● Ready`.

---

## Self-Review

**Spec coverage:**
- Search-first Add UI → Task 3. ✓
- `find_existing` (min-2-char, category-scoped, excludes current group) → Task 2. ✓
- `add_existing` with category guard, group-assignment insert, checkin upsert, no cross-session writes → Task 1. ✓
- Instant refresh 15s→5s → Task 3 Step 1. ✓
- Tests: guard rejection (no writes), happy-path upsert, min-query short-circuit → Tasks 1 & 2. ✓
- Out-of-scope items (offline banner, undo, dup-name guard) → correctly absent. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type/name consistency:** `auth.ageCategoryId` (from `authorizeCheckin`), action names `find_existing`/`add_existing`, response shapes `{ matches }` / `{ success: true }`, and the `runLookup`/`checkInExisting`/`matches`/`searching` identifiers are used consistently across tasks and tests. The happy-path test asserts on `INTO player_checkins` which matches the implemented SQL. ✓
