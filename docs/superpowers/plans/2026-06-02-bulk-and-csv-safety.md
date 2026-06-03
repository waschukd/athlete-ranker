# Bulk Actions + CSV Transparency Implementation Plan

> REQUIRED SUB-SKILL: subagent-driven-development / executing-plans. Checkbox steps.

**Goal:** Add bulk approve/deny for God Mode evaluator join requests, and surface what CSV imports changed (added vs updated).

**Spec:** `docs/superpowers/specs/2026-06-02-bulk-and-csv-safety-design.md`

---

## Task 1: Batch approve/deny endpoint (TDD)

**Files:**
- Modify: `src/app/api/admin/god-mode/evaluator-invites/route.js`
- Create: `tests/unit/evaluator-invites-batch.test.js`

- [ ] **Step 1: Failing tests.** Create `tests/unit/evaluator-invites-batch.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireSuperAdmin: vi.fn() }));

import sql from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";

function makeReq(body) {
  return new Request("http://test/api/admin/god-mode/evaluator-invites", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}
beforeEach(() => { vi.clearAllMocks(); });

describe("evaluator-invites POST", () => {
  it("403 when not super admin", async () => {
    requireSuperAdmin.mockResolvedValue(null);
    const { POST } = await import("@/app/api/admin/god-mode/evaluator-invites/route");
    const res = await POST(makeReq({ request_ids: ["a"], action: "approve" }));
    expect(res.status).toBe(403);
  });

  it("batch approve updates via ANY and returns count", async () => {
    requireSuperAdmin.mockResolvedValue({ id: "admin1" });
    sql.mockResolvedValueOnce([]); // UPDATE
    const { POST } = await import("@/app/api/admin/god-mode/evaluator-invites/route");
    const res = await POST(makeReq({ request_ids: ["a", "b", "c"], action: "approve" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true, count: 3 });
    const ran = sql.mock.calls.map(c => c[0].join("?"));
    expect(ran.some(s => s.includes("evaluator_join_requests") && s.includes("ANY"))).toBe(true);
  });

  it("still accepts a single request_id (back-compat)", async () => {
    requireSuperAdmin.mockResolvedValue({ id: "admin1" });
    sql.mockResolvedValueOnce([]); // UPDATE
    const { POST } = await import("@/app/api/admin/god-mode/evaluator-invites/route");
    const res = await POST(makeReq({ request_id: "x", action: "deny" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true, count: 1 });
  });

  it("400 when no ids provided", async () => {
    requireSuperAdmin.mockResolvedValue({ id: "admin1" });
    const { POST } = await import("@/app/api/admin/god-mode/evaluator-invites/route");
    const res = await POST(makeReq({ action: "approve" }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run, verify failure.** `npx vitest run tests/unit/evaluator-invites-batch.test.js` → the batch/400 tests FAIL (current handler ignores request_ids, has no 400, returns no count).

- [ ] **Step 3: Implement.** Replace the `POST` function in `evaluator-invites/route.js` with:

```javascript
export async function POST(request) {
  try {
    const adminUser = await requireSuperAdmin(); if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const body = await request.json();
    const ids = Array.isArray(body.request_ids)
      ? body.request_ids
      : (body.request_id ? [body.request_id] : []);
    if (!ids.length) return NextResponse.json({ error: "No request ids" }, { status: 400 });
    const status = body.action === "approve" ? "approved" : "denied";
    await sql`UPDATE evaluator_join_requests SET status = ${status}, reviewed_at = NOW() WHERE id = ANY(${ids})`;
    return NextResponse.json({ success: true, count: ids.length });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run, verify pass.** `npx vitest run tests/unit/evaluator-invites-batch.test.js` → 4 PASS.

- [ ] **Step 5: Commit.**
```bash
git add "src/app/api/admin/god-mode/evaluator-invites/route.js" tests/unit/evaluator-invites-batch.test.js
git commit -m "feat(god-mode): batch approve/deny join requests (request_ids[]), keep single back-compat"
```

---

## Task 2: Schedule route inserted/updated counts (build-verified)

**Files:** Modify `src/app/api/categories/[catId]/schedule/route.js`

- [ ] **Step 1:** Find the upsert loop. Near the `let count = 0;` declaration (before the `for` loop that processes `body.schedule`), add two counters. If the declaration is `let count = 0;`, change it to:
```javascript
    let count = 0, inserted = 0, updated = 0;
```
(If `count` is declared differently, add `let inserted = 0, updated = 0;` on the next line.)

- [ ] **Step 2:** In the existing `if (existingEntry.length) { ... UPDATE ... } else { ... INSERT ... }`, increment the counters: add `updated++;` as the last line inside the `if` (UPDATE) branch, and `inserted++;` as the last line inside the `else` (INSERT) branch. Leave the existing `count++;` after the if/else as-is.

- [ ] **Step 3:** Change the success return `return NextResponse.json({ success: true, count });` to:
```javascript
    return NextResponse.json({ success: true, count, inserted, updated });
```

- [ ] **Step 4: Build.** `npm run build` → success.

- [ ] **Step 5: Commit.**
```bash
git add "src/app/api/categories/[catId]/schedule/route.js"
git commit -m "feat(schedule): return inserted/updated breakdown from CSV upload"
```

---

## Task 3: Bulk UI + import result messages (build-verified)

**Files:** Modify `src/components/GodMode/EvaluatorsTab.jsx`, `src/components/CategoryDashboard.jsx`

### 3a — EvaluatorsTab multi-select + bulk buttons

- [ ] **Step 1:** Add `useState` to the React import line. Current first import is `import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";`. Add a React import at the top:
```javascript
import { useState } from "react";
```

- [ ] **Step 2:** Inside `EvaluatorsTab`, after the `approveMutation` definition, add a batch mutation and selection state:
```javascript
  const [selectedIds, setSelectedIds] = useState([]);
  const bulkMutation = useMutation({
    mutationFn: async ({ request_ids, action }) => {
      const res = await fetch("/api/admin/god-mode/evaluator-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_ids, action }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { setSelectedIds([]); queryClient.invalidateQueries(["god-mode-evaluator-invites"]); },
  });
  const toggleId = (id) => setSelectedIds(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
```

- [ ] **Step 3:** Add a bulk action bar. Immediately AFTER the "Pending Join Requests" title `div` (the block containing the section title + count badge, which closes around the pending count badge) and BEFORE the `{isLoading ? (` line, insert:
```javascript
        {pendingRequests.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--gm-muted)", cursor: "pointer" }}>
              <input type="checkbox"
                checked={selectedIds.length === pendingRequests.length && pendingRequests.length > 0}
                onChange={e => setSelectedIds(e.target.checked ? pendingRequests.map(r => r.id) : [])} />
              Select all
            </label>
            {selectedIds.length > 0 && (
              <>
                <button onClick={() => bulkMutation.mutate({ request_ids: selectedIds, action: "approve" })}
                  disabled={bulkMutation.isPending}
                  style={{ padding: "6px 12px", background: "var(--gm-green-soft)", border: "1px solid rgba(34,211,160,0.2)", borderRadius: 7, color: "var(--gm-green)", cursor: "pointer", fontSize: 12, fontWeight: 500 }}>
                  Approve selected ({selectedIds.length})
                </button>
                <button onClick={() => bulkMutation.mutate({ request_ids: selectedIds, action: "deny" })}
                  disabled={bulkMutation.isPending}
                  style={{ padding: "6px 12px", background: "var(--gm-red-soft)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 7, color: "var(--gm-red)", cursor: "pointer", fontSize: 12, fontWeight: 500 }}>
                  Deny selected ({selectedIds.length})
                </button>
              </>
            )}
          </div>
        )}
```

- [ ] **Step 4:** Add a checkbox to each pending request row. In the `pendingRequests.map((request) => (` row, the first child is `<div style={{ flex: 1, minWidth: 0 }}>`. Immediately BEFORE that div, add:
```javascript
                <input type="checkbox" checked={selectedIds.includes(request.id)} onChange={() => toggleId(request.id)} style={{ flexShrink: 0 }} />
```

### 3b — Import result messages in CategoryDashboard

- [ ] **Step 5:** Find the schedule CSV upload handler (it POSTs to `/api/categories/${catId}/schedule` and sets a result message like `setScheduleMsg(`...uploaded`)` or similar). Read the surrounding lines to learn the exact state-setter name and the `data` variable. Change the success message to use the new breakdown, e.g. if it currently does `setScheduleMsg(`${data.count} entries uploaded`)`, change to:
```javascript
      setScheduleMsg(`${data.inserted ?? data.count} added, ${data.updated ?? 0} updated`);
```
Adapt to the actual setter/variable names found.

- [ ] **Step 6:** Find the athletes upload result message (currently like `setAthleteMsg(`${data.inserted || 0} imported, ${data.skipped || 0} skipped`)`). Add the updated count:
```javascript
      setAthleteMsg(`${data.imported ?? data.inserted ?? 0} imported, ${data.updated ?? 0} updated, ${data.skipped ?? 0} skipped`);
```
Adapt to actual names (note: the athletes route returns `imported`/`updated`/`skipped`).

- [ ] **Step 7: Build + full suite.** `npm run build` (success) and `npm run test` (green).

- [ ] **Step 8: Commit.**
```bash
git add "src/components/GodMode/EvaluatorsTab.jsx" "src/components/CategoryDashboard.jsx"
git commit -m "feat(ui): bulk approve/deny join requests + CSV import breakdown messages"
```

---

## Task 4: Verify, push, PR

- [ ] `npm run test` (green) + `npm run build` (clean). Controller pushes branch + opens PR. No merge, no deploy.

---

## Self-Review

- Bulk approve/deny → Task 1 (endpoint, TDD) + Task 3a (UI). ✓
- CSV transparency → Task 2 (schedule counts) + Task 3b (messages). ✓
- Deferred items (bulk delete, SP bulk, hard confirm) documented in spec, not built. ✓
- Placeholders: none; full code. UI steps 5/6 explicitly tell the implementer to confirm setter/variable names. ✓
- Names: `request_ids`/`count` consistent between endpoint, test, and UI mutation; `inserted`/`updated` consistent between schedule route and message. ✓
