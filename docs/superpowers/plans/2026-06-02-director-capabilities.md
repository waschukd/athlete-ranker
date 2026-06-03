# Director Capabilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: subagent-driven-development / executing-plans. Checkbox steps.

**Goal:** Give assigned directors (1) live check-in visibility, (2) flag acknowledgment with an audit trail, and (3) group-building access — reusing existing director-authorized APIs, unblocking only via scoped middleware + UI.

**Architecture:** A scoped middleware regex grants directors the `groups`/`flags` sub-pages only. A new `checkin-summary` endpoint feeds per-session badges. The flags acknowledge action gains an audit-log write. `CategoryDashboard` exposes a Groups tab + check-in badges.

**Spec:** `docs/superpowers/specs/2026-06-02-director-capabilities-design.md`

---

## Task 1: `checkin-summary` endpoint (TDD)

**Files:**
- Create: `src/app/api/categories/[catId]/checkin-summary/route.js`
- Create: `tests/unit/checkin-summary.test.js`

- [ ] **Step 1: Failing tests.** Create `tests/unit/checkin-summary.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-secret-checkin-summary";

import sql from "@/lib/db";
import { getSession } from "@/lib/auth";

function makeReq() { return new Request("http://test/api/categories/cat1/checkin-summary"); }

beforeEach(() => { vi.clearAllMocks(); });

describe("GET checkin-summary", () => {
  it("returns 403 when not authorized", async () => {
    getSession.mockResolvedValue({ email: "x@test", role: "director" });
    // authorizeCategoryAccess(director): category lookup, user lookup, assignment lookup (empty → denied)
    sql.mockResolvedValueOnce([{ organization_id: "org1" }]); // category
    sql.mockResolvedValueOnce([{ id: "u1" }]);                 // user
    sql.mockResolvedValueOnce([]);                              // no active assignment
    const { GET } = await import("@/app/api/categories/[catId]/checkin-summary/route");
    const res = await GET(makeReq(), { params: { catId: "cat1" } });
    expect(res.status).toBe(403);
  });

  it("returns per-session counts for an authorized super_admin", async () => {
    getSession.mockResolvedValue({ email: "root@test", role: "super_admin" });
    sql.mockResolvedValueOnce([{ organization_id: "org1" }]); // authorizeCategoryAccess super_admin
    sql.mockResolvedValueOnce([
      { schedule_id: "s1", session_number: 1, group_number: 1, checked_in: 8, total: 10 },
    ]); // summary query
    const { GET } = await import("@/app/api/categories/[catId]/checkin-summary/route");
    const res = await GET(makeReq(), { params: { catId: "cat1" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0]).toMatchObject({ schedule_id: "s1", checked_in: 8, total: 10 });
  });
});
```

- [ ] **Step 2: Run, verify failure.** `npx vitest run tests/unit/checkin-summary.test.js` → FAIL (module missing).

- [ ] **Step 3: Implement** `src/app/api/categories/[catId]/checkin-summary/route.js`:

```javascript
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;

    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const sessions = await sql`
      SELECT es.id AS schedule_id, es.session_number, es.group_number,
        COUNT(pc.id) FILTER (WHERE pc.checked_in) AS checked_in,
        COUNT(pc.id) AS total
      FROM evaluation_schedule es
      LEFT JOIN player_checkins pc ON pc.schedule_id = es.id
      WHERE es.age_category_id = ${catId}
      GROUP BY es.id, es.session_number, es.group_number
      ORDER BY es.session_number, es.group_number
    `;

    return NextResponse.json({ sessions });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run, verify pass.** `npx vitest run tests/unit/checkin-summary.test.js` → 2 PASS.

- [ ] **Step 5: Commit.**
```bash
git add "src/app/api/categories/[catId]/checkin-summary/route.js" tests/unit/checkin-summary.test.js
git commit -m "feat(checkin): category check-in summary endpoint (per-session counts)"
```

---

## Task 2: Flag acknowledge audit trail (TDD)

**Files:**
- Modify: `src/app/api/categories/[catId]/flags/route.js`
- Create: `tests/unit/flags-acknowledge.test.js`

- [ ] **Step 1: Failing test.** Create `tests/unit/flags-acknowledge.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-secret-flags-ack";

import sql from "@/lib/db";
import { getSession } from "@/lib/auth";

function makeReq(body) {
  return new Request("http://test/api/categories/cat1/flags", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}
beforeEach(() => { vi.clearAllMocks(); });

it("acknowledge writes an audit_log row", async () => {
  getSession.mockResolvedValue({ email: "dir@test", role: "super_admin" });
  sql.mockResolvedValueOnce([{ organization_id: "org1" }]); // authorizeCategoryAccess super_admin
  sql.mockResolvedValueOnce([{ id: "u1" }]); // user lookup in acknowledge
  sql.mockResolvedValueOnce([]);             // UPDATE athlete_flags
  sql.mockResolvedValueOnce([]);             // INSERT audit_log
  const { POST } = await import("@/app/api/categories/[catId]/flags/route");
  const res = await POST(makeReq({ action: "acknowledge", flag_id: "f1" }), { params: { catId: "cat1" } });
  expect(res.status).toBe(200);
  const ran = sql.mock.calls.map(c => c[0].join("?"));
  expect(ran.some(s => s.includes("INTO audit_log") && s.includes("flag_acknowledged"))).toBe(true);
});
```

- [ ] **Step 2: Run, verify failure.** `npx vitest run tests/unit/flags-acknowledge.test.js` → FAIL (no audit insert).

- [ ] **Step 3: Implement.** In `flags/route.js`, the `acknowledge` action currently is:

```javascript
    if (action === "acknowledge") {
      const userRes = await sql`SELECT id FROM users WHERE email = ${session.email}`;
      const userId = userRes[0]?.id;
      await sql`
        UPDATE athlete_flags
        SET acknowledged = true, acknowledged_by = ${userId}, acknowledged_at = NOW()
        WHERE id = ${flag_id}
      `;
      return NextResponse.json({ success: true });
    }
```

Replace with (adds the audit insert before returning):

```javascript
    if (action === "acknowledge") {
      const userRes = await sql`SELECT id FROM users WHERE email = ${session.email}`;
      const userId = userRes[0]?.id;
      await sql`
        UPDATE athlete_flags
        SET acknowledged = true, acknowledged_by = ${userId}, acknowledged_at = NOW()
        WHERE id = ${flag_id}
      `;
      await sql`
        INSERT INTO audit_log (user_id, action, entity_type, entity_id, age_category_id)
        VALUES (${userId}, 'flag_acknowledged', 'athlete_flag', ${flag_id}, ${catId})
      `;
      return NextResponse.json({ success: true });
    }
```

- [ ] **Step 4: Run, verify pass.** `npx vitest run tests/unit/flags-acknowledge.test.js` → PASS.

- [ ] **Step 5: Commit.**
```bash
git add "src/app/api/categories/[catId]/flags/route.js" tests/unit/flags-acknowledge.test.js
git commit -m "feat(flags): audit-log flag acknowledgments (director traceability)"
```

---

## Task 3: Scoped middleware access for directors

**Files:** Modify `src/middleware.js`

- [ ] **Step 1: Add the regex constant.** After the `ROLE_ROUTES` object definition, add:

```javascript
// Directors are not association admins, but an assigned director may use the
// group-building and flags sub-pages (the APIs already authorize them per-category).
const DIRECTOR_ASSOC_ALLOW = /^\/association\/dashboard\/category\/[^/]+\/(groups|flags)(\/|$)/;
```

- [ ] **Step 2: Allow matching director requests before the role loop.** In the `try` block, immediately after `const { payload } = await jwtVerify(token, SECRET);` and before the `for (const [route, roles] of Object.entries(ROLE_ROUTES))` loop, add:

```javascript
    if (payload.role === "director" && DIRECTOR_ASSOC_ALLOW.test(pathname)) {
      return NextResponse.next();
    }
```

- [ ] **Step 3: Build.** `npm run build` → success.

- [ ] **Step 4: Commit.**
```bash
git add src/middleware.js
git commit -m "feat(authz): allow assigned directors into groups/flags sub-pages only"
```

---

## Task 4: CategoryDashboard — Groups tab + check-in badges

**Files:** Modify `src/components/CategoryDashboard.jsx`

- [ ] **Step 1: Confirm the groups render block exists.** Search the file for `activeTab === "groups"`. It should already render a "Manage Groups" link to `/association/dashboard/category/${catId}/groups?org=${orgId}`. If it does NOT exist, add this block alongside the other `activeTab === ...` blocks:

```javascript
        {activeTab === "groups" && (
          <div className="space-y-4">
            <a href={`/association/dashboard/category/${catId}/groups?org=${orgId}`}
               className="inline-flex items-center gap-2 px-4 py-2 bg-[#1A6BFF] text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              <Users size={16} /> Manage Groups
            </a>
          </div>
        )}
```

- [ ] **Step 2: Add the Groups tab.** Change the `tabs` array (currently lines ~202-210) to include a groups entry after `reports`:

```javascript
  const tabs = [
    { id: "rankings", label: "Rankings", icon: BarChart3 },
    { id: "goalies", label: "Goalies", icon: Users },
    { id: "scores", label: "Scores", icon: Settings },
    { id: "reports", label: "Reports", icon: FileText },
    { id: "groups", label: "Groups", icon: Users },
    { id: "schedule", label: "Schedule", icon: Calendar },
    { id: "athletes", label: "Athletes", icon: Users },
    { id: "teams", label: "Teams", icon: Trophy },
  ];
```

- [ ] **Step 3: Add the check-in summary query.** Near the other `useQuery` hooks in the component, add a query for the summary (find an existing `useQuery` to match the exact style/options used — `enabled` on `catId`):

```javascript
  const { data: checkinSummary } = useQuery({
    queryKey: ["checkin-summary", catId],
    queryFn: async () => {
      const res = await fetch(`/api/categories/${catId}/checkin-summary`);
      if (!res.ok) return { sessions: [] };
      return res.json();
    },
    enabled: !!catId,
    refetchInterval: 15000,
  });
```

- [ ] **Step 4: Render a badge per session in the Schedule tab.** In the schedule tab's per-session/row rendering (around the `activeTab === "schedule"` block, where each schedule entry `e` is mapped), add a badge that looks up the matching summary row by `schedule_id` (the schedule entry's id field — confirm the field name in the existing map, likely `e.id`):

```javascript
                  {(() => {
                    const s = (checkinSummary?.sessions || []).find(x => x.schedule_id === e.id);
                    return s && Number(s.total) > 0 ? (
                      <span className="text-xs px-2 py-1 bg-green-50 text-green-700 border border-green-200 rounded-lg">
                        {s.checked_in}/{s.total} checked in
                      </span>
                    ) : null;
                  })()}
```

Place it inline with the other per-session metadata badges. If the schedule map variable is not `e` or the id field is not `e.id`, adapt to the actual names in the file (read the schedule block first).

- [ ] **Step 5: Build + full suite.** `npm run build` (success) and `npm run test` (green).

- [ ] **Step 6: Commit.**
```bash
git add "src/components/CategoryDashboard.jsx"
git commit -m "feat(dashboard): Groups tab + per-session check-in badges (director visibility)"
```

---

## Task 5: Verify, push, PR

- [ ] **Step 1:** `npm run test` (full suite green) and `npm run build` (clean).
- [ ] **Step 2:** Controller pushes the branch and opens the PR (do not merge, do not deploy).

---

## Self-Review

- Check-in visibility → Tasks 1 + 4 (endpoint + badges). ✓
- Flag acknowledgment → Tasks 2 + 3 (audit + middleware unblock; page/action already exist). ✓
- Group building → Tasks 3 + 4 (middleware unblock + tab). ✓
- Score correction → intentionally absent. ✓
- Placeholders: none; full code given. UI step 4 explicitly tells the implementer to verify the map var/id field. ✓
- Names: `checkin-summary` route + `{sessions}` shape consistent across endpoint, test, and dashboard query; `flag_acknowledged` audit action consistent between impl and test. ✓
