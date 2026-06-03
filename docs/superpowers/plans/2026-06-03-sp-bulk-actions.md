# Service-Provider Bulk Actions Implementation Plan

> REQUIRED SUB-SKILL: subagent-driven-development / executing-plans. Checkbox steps.

**Goal:** Bulk approve-hours, dismiss-flags, approve/suspend/delete evaluators on the SP dashboard, with the destructive delete behind a typed confirm.

**Spec:** `docs/superpowers/specs/2026-06-03-sp-bulk-actions-design.md`

---

## Task 1: API bulk support (TDD)

**Files:**
- Modify: `src/app/api/service-provider/evaluators/route.js`
- Create: `tests/unit/sp-evaluators-bulk.test.js`

- [ ] **Step 1: Failing tests.** Create `tests/unit/sp-evaluators-bulk.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn(), resolveSpOrgId: vi.fn() }));

import sql from "@/lib/db";
import { getSession, resolveSpOrgId } from "@/lib/auth";

function makeReq(body) {
  return new Request("http://test/api/service-provider/evaluators?org=sp1", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}
// Standard authorized setup: session present, org resolves, admin lookup returns an id.
function authOk() {
  getSession.mockResolvedValue({ email: "spadmin@test" });
  resolveSpOrgId.mockResolvedValue("sp1");
  sql.mockResolvedValueOnce([{ id: "admin1" }]); // admin lookup (first sql call in POST)
}
const ran = () => sql.mock.calls.map(c => c[0].join("?"));
beforeEach(() => { vi.clearAllMocks(); });

describe("SP evaluators bulk POST", () => {
  it("403 when not an SP admin", async () => {
    getSession.mockResolvedValue({ email: "x@test" });
    resolveSpOrgId.mockResolvedValue(null);
    const { POST } = await import("@/app/api/service-provider/evaluators/route");
    const res = await POST(makeReq({ action: "approve_hours", hours_ids: ["h1"] }));
    expect(res.status).toBe(403);
  });

  it("approve_hours bulk uses ANY + org scope and returns count", async () => {
    authOk();
    sql.mockResolvedValueOnce([]); // UPDATE evaluator_hours
    const { POST } = await import("@/app/api/service-provider/evaluators/route");
    const res = await POST(makeReq({ action: "approve_hours", hours_ids: ["h1", "h2"] }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true, count: 2 });
    expect(ran().some(s => s.includes("evaluator_hours") && s.includes("ANY") && s.includes("organization_id"))).toBe(true);
  });

  it("approve_hours single back-compat still works", async () => {
    authOk();
    sql.mockResolvedValueOnce([]);
    const { POST } = await import("@/app/api/service-provider/evaluators/route");
    const res = await POST(makeReq({ action: "approve_hours", hours_id: "h9" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true, count: 1 });
  });

  it("dismiss_flag bulk uses ANY + org scope", async () => {
    authOk();
    sql.mockResolvedValueOnce([]); // UPDATE evaluator_flags
    const { POST } = await import("@/app/api/service-provider/evaluators/route");
    const res = await POST(makeReq({ action: "dismiss_flag", flag_ids: ["f1", "f2"] }));
    expect(res.status).toBe(200);
    expect(ran().some(s => s.includes("evaluator_flags") && s.includes("ANY"))).toBe(true);
  });

  it("approve evaluators bulk updates memberships via ANY", async () => {
    authOk();
    sql.mockResolvedValueOnce([]); // UPDATE evaluator_memberships
    sql.mockResolvedValueOnce([]); // audit insert id1
    sql.mockResolvedValueOnce([]); // audit insert id2
    const { POST } = await import("@/app/api/service-provider/evaluators/route");
    const res = await POST(makeReq({ action: "approve", evaluator_ids: ["u1", "u2"] }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true, count: 2 });
    expect(ran().some(s => s.includes("evaluator_memberships") && s.includes("ANY"))).toBe(true);
  });

  it("suspend bulk runs membership + signup updates with ANY", async () => {
    authOk();
    sql.mockResolvedValueOnce([]); // membership suspend
    sql.mockResolvedValueOnce([]); // signups suspend
    sql.mockResolvedValueOnce([]); // audit id1
    const { POST } = await import("@/app/api/service-provider/evaluators/route");
    const res = await POST(makeReq({ action: "suspend", evaluator_ids: ["u1"] }));
    expect(res.status).toBe(200);
    expect(ran().some(s => s.includes("evaluator_memberships") && s.includes("ANY"))).toBe(true);
    expect(ran().some(s => s.includes("evaluator_session_signups") && s.includes("ANY"))).toBe(true);
  });

  it("delete_account bulk skips evaluators with session history", async () => {
    authOk();
    sql.mockResolvedValueOnce([{ count: "2" }]); // history check u1 → has history → skip
    sql.mockResolvedValueOnce([{ count: "0" }]); // history check u2 → none
    sql.mockResolvedValueOnce([]);                // DELETE memberships u2
    sql.mockResolvedValueOnce([{ id: "au2" }]);   // auth_users lookup u2
    sql.mockResolvedValueOnce([]);                // DELETE auth_accounts
    sql.mockResolvedValueOnce([]);                // DELETE auth_users
    sql.mockResolvedValueOnce([]);                // DELETE users u2
    const { POST } = await import("@/app/api/service-provider/evaluators/route");
    const res = await POST(makeReq({ action: "delete_account", evaluator_ids: ["u1", "u2"] }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true, deleted: 1, skipped: 1 });
  });
});
```

- [ ] **Step 2: Run, verify failure.** `npx vitest run tests/unit/sp-evaluators-bulk.test.js` → multiple FAIL (single-id handlers, no count, no array support).

- [ ] **Step 3: Implement.** In `src/app/api/service-provider/evaluators/route.js`, keep the imports/GET unchanged. Replace the destructured-body line and the five targeted action blocks. After the `const adminRes = ...; const admin_id = adminRes[0]?.id;` line, add the helper and rewrite actions. Concretely:

(a) Change the body parse line from
```javascript
    const { action, evaluator_id, schedule_id, hours_id, rating, notes, flag_id } = await request.json();
```
to
```javascript
    const body = await request.json();
    const { action, evaluator_id, schedule_id, hours_id, rating, notes, flag_id } = body;
    const asArray = (arr, single) => Array.isArray(arr) ? arr : (single != null ? [single] : []);
```

(b) Replace the `approve_hours` block with:
```javascript
    if (action === "approve_hours") {
      const ids = asArray(body.hours_ids, hours_id);
      if (!ids.length) return NextResponse.json({ error: "No hours ids" }, { status: 400 });
      await sql`UPDATE evaluator_hours SET status = 'approved', approved_by = ${admin_id}, approved_at = NOW() WHERE id = ANY(${ids}) AND organization_id = ${sp_id}`;
      return NextResponse.json({ success: true, count: ids.length });
    }
```

(c) Replace the `approve` block with:
```javascript
    if (action === "approve") {
      const ids = asArray(body.evaluator_ids, evaluator_id);
      if (!ids.length) return NextResponse.json({ error: "No evaluator ids" }, { status: 400 });
      await sql`UPDATE evaluator_memberships SET status = 'active', pending = false WHERE user_id = ANY(${ids}) AND organization_id = ${sp_id}`;
      for (const id of ids) {
        await sql`INSERT INTO audit_log (user_id, action, entity_type, entity_id, new_value) VALUES (${admin_id}, 'evaluator_approved', 'user', ${id}, 'approved by SP admin')`;
      }
      return NextResponse.json({ success: true, count: ids.length });
    }
```

(d) Replace the `suspend` block with:
```javascript
    if (action === "suspend") {
      const ids = asArray(body.evaluator_ids, evaluator_id);
      if (!ids.length) return NextResponse.json({ error: "No evaluator ids" }, { status: 400 });
      await sql`UPDATE evaluator_memberships SET status = 'suspended' WHERE user_id = ANY(${ids}) AND organization_id = ${sp_id}`;
      await sql`UPDATE evaluator_session_signups SET status = 'suspended' WHERE user_id = ANY(${ids}) AND status = 'signed_up' AND schedule_id IN (SELECT id FROM evaluation_schedule WHERE scheduled_date > CURRENT_DATE)`;
      for (const id of ids) {
        await sql`INSERT INTO audit_log (user_id, action, entity_type, entity_id, new_value) VALUES (${admin_id}, 'evaluator_suspended', 'user', ${id}, 'suspended by SP admin')`;
      }
      return NextResponse.json({ success: true, count: ids.length });
    }
```

(e) Replace the `delete_account` block with:
```javascript
    if (action === "delete_account") {
      const ids = asArray(body.evaluator_ids, evaluator_id);
      if (!ids.length) return NextResponse.json({ error: "No evaluator ids" }, { status: 400 });
      let deleted = 0; const skipped = [];
      for (const id of ids) {
        const hasHistory = await sql`SELECT COUNT(*) as count FROM evaluator_session_signups WHERE user_id = ${id}`;
        if (parseInt(hasHistory[0].count) > 0) { skipped.push(id); continue; }
        await sql`DELETE FROM evaluator_memberships WHERE user_id = ${id}`;
        const authUser = await sql`SELECT id FROM auth_users WHERE email = (SELECT email FROM users WHERE id = ${id})`;
        if (authUser.length) {
          await sql`DELETE FROM auth_accounts WHERE "userId" = ${authUser[0].id}`;
          await sql`DELETE FROM auth_users WHERE id = ${authUser[0].id}`;
        }
        await sql`DELETE FROM users WHERE id = ${id}`;
        deleted++;
      }
      return NextResponse.json({ success: true, deleted, skipped: skipped.length });
    }
```

(f) Replace the `dismiss_flag` block with:
```javascript
    if (action === "dismiss_flag") {
      const ids = asArray(body.flag_ids, flag_id);
      if (!ids.length) return NextResponse.json({ error: "No flag ids" }, { status: 400 });
      await sql`UPDATE evaluator_flags SET reviewed = true, reviewed_by = ${admin_id}, reviewed_at = NOW() WHERE id = ANY(${ids}) AND organization_id = ${sp_id}`;
      return NextResponse.json({ success: true, count: ids.length });
    }
```

(Leave `rate_evaluator` and `reinstate` exactly as they are.)

- [ ] **Step 4: Run, verify pass.** `npx vitest run tests/unit/sp-evaluators-bulk.test.js` → all PASS.

- [ ] **Step 5: Commit.**
```bash
git add "src/app/api/service-provider/evaluators/route.js" tests/unit/sp-evaluators-bulk.test.js
git commit -m "feat(sp): bulk approve-hours/dismiss-flag/approve/suspend/delete (arrays, back-compat, org-scoped)"
```

---

## Task 2: SP dashboard multi-select UI (build-verified)

**Files:** Modify `src/app/service-provider/dashboard/page.jsx`

Read the file first to learn the exact list variables and how mutations are defined. The lists are: pending hours table (`pendingHours`, id `h.id`), flags section (`flags`, id `flag.id`), evaluators table (`evaluators`, id `ev.id`). There is an existing mutation helper that POSTs to `/api/service-provider/evaluators` with `?org=` — reuse its URL/auth approach for the bulk calls.

- [ ] **Step 1:** Add selection state (near the component's other `useState`s):
```javascript
  const [selHours, setSelHours] = useState([]);
  const [selFlags, setSelFlags] = useState([]);
  const [selEvals, setSelEvals] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState("");
```
Add `useState` to the React import if not already present.

- [ ] **Step 2:** Add a bulk mutation that posts to the same endpoint the per-row actions use (match the existing `?org=` query usage). It accepts a body object and posts it verbatim:
```javascript
  const bulkAction = async (body) => {
    await fetch(`/api/service-provider/evaluators?org=${orgId}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  };
```
(Use whatever the existing code uses to obtain the org id — likely an `orgId`/`org` variable already in scope. If the per-row actions use a react-query mutation + invalidate, mirror that: call the existing query invalidation after `bulkAction` resolves.)

- [ ] **Step 3:** Pending hours table — add a checkbox column. In the hours `<thead>` add a `<th>` (select-all checkbox toggling `setSelHours(checked ? pendingHours.map(h=>h.id) : [])`), and in each row a `<td>` with `<input type="checkbox" checked={selHours.includes(h.id)} onChange={() => setSelHours(s => s.includes(h.id)?s.filter(x=>x!==h.id):[...s,h.id])} />`. Above the table, when `selHours.length>0`, render: a button "Approve selected ({selHours.length})" → `await bulkAction({ action:"approve_hours", hours_ids: selHours }); setSelHours([]); <invalidate/refetch>`.

- [ ] **Step 4:** Flags section — add a checkbox per flag card and a "Dismiss selected (N)" button when `selFlags.length>0` → `bulkAction({ action:"dismiss_flag", flag_ids: selFlags })` then clear + refetch.

- [ ] **Step 5:** Evaluators table — add a checkbox column (select-all + per-row on `ev.id` into `selEvals`). When `selEvals.length>0`, show a bulk bar with:
  - "Approve ({n})" → `bulkAction({ action:"approve", evaluator_ids: selEvals })` + clear + refetch.
  - "Suspend ({n})" → `if (confirm('Suspend N evaluators?')) { bulkAction({ action:"suspend", evaluator_ids: selEvals }) ... }`.
  - "Delete ({n})" → opens a typed-confirm modal (next step).

- [ ] **Step 6:** Typed-confirm delete modal. When the user clicks "Delete (N)", show a modal containing: a warning that this permanently deletes the selected evaluators and that any with session history will be skipped; a text input bound to `deleteConfirm`; and a "Delete" button that is `disabled={deleteConfirm !== "DELETE"}`. On confirm:
```javascript
    const res = await fetch(`/api/service-provider/evaluators?org=${orgId}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_account", evaluator_ids: selEvals }),
    });
    const data = await res.json();
    // show `${data.deleted} deleted, ${data.skipped} skipped (had session history)`
    setSelEvals([]); setDeleteConfirm(""); /* close modal + refetch */
```

- [ ] **Step 7: Build + full suite.** `npm run build` (success) + `npm run test` (green — should be prior count + 7 new from Task 1).

- [ ] **Step 8: Commit.**
```bash
git add "src/app/service-provider/dashboard/page.jsx"
git commit -m "feat(sp): multi-select bulk actions UI + typed-confirm bulk delete"
```

---

## Task 3: Verify + hand off
- [ ] `npm run test` green + `npm run build` clean. Controller reviews, then merges/deploys per user direction.

---

## Self-Review

- All five bulk actions → Task 1 (API, TDD) + Task 2 (UI). ✓
- Destructive delete gated by typed-`DELETE` confirm + per-id history skip. ✓
- Auth (`getSession`+`resolveSpOrgId`) preserved; org-scope added to hours/flags. ✓
- Back-compat single ids preserved (asArray) + tested. ✓
- Placeholders: API code exact; UI steps tell the implementer to mirror existing mutation/refetch + org-id usage (large existing file). ✓
- Names: `hours_ids`/`flag_ids`/`evaluator_ids` consistent between API, tests, and UI calls. ✓
