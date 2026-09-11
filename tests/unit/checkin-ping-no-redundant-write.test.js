// Real waste found in a pre-tryout-weekend load audit: every single poll of
// the check-in screen (GET) unconditionally ran `UPDATE checkin_sessions SET
// is_open = true`, regardless of whether the session was already open. At 8
// concurrent check-in screens on a short poll interval that's a steady
// stream of writes doing nothing 99% of the time. Now only writes when the
// session is actually closed and needs reopening.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(), signToken: vi.fn(), verifyToken: vi.fn(),
  getCurrentUser: vi.fn(), getAppUserId: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined }) }));
vi.mock("@/lib/categoryEvaluators", () => ({ resolveEvaluatorKind: vi.fn(async () => "skater") }));
vi.mock("@/lib/helmetMode", () => ({ resolveHelmetMode: vi.fn(async () => false) }));

process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-secret-for-checkin-ping-suite";

import sql from "@/lib/db";
import { getSession } from "@/lib/auth";

function makeReq() {
  return new Request("http://test/api/checkin/sched1", { method: "GET" });
}

function baseMocks({ isOpen }) {
  getSession.mockResolvedValue({ email: "vol@test", role: "super_admin" });
  sql.mockImplementation(async (strings) => {
    const text = strings.join("?");
    if (text.includes("SELECT age_category_id FROM evaluation_schedule")) return [{ age_category_id: "cat1" }];
    if (text.includes("SELECT organization_id FROM age_categories")) return [{ organization_id: "org1" }];
    if (text.includes("FROM evaluation_schedule sch")) return [{ id: "sched1", category_id: "cat1", category_name: "U13", session_number: 1, group_number: 1, org_name: "Org", eval_format: null, sticky_jersey_numbers: false }];
    if (text.includes("SELECT * FROM checkin_sessions")) return [{ id: "cs1", schedule_id: "sched1", is_open: isOpen, team_colors: '["Red","Blue"]' }];
    if (text.includes("FROM session_groups sg")) return [];
    if (text.includes("FROM athletes a")) return [];
    return [];
  });
}

describe("GET /api/checkin/[scheduleId] — is_open write", () => {
  it("does NOT write when the check-in session is already open", async () => {
    baseMocks({ isOpen: true });
    const { GET } = await import("@/app/api/checkin/[scheduleId]/route");
    const res = await GET(makeReq(), { params: { scheduleId: "sched1" } });
    expect(res.status).toBe(200);
    const updateCall = sql.mock.calls.find(c => c[0].join("?").includes("UPDATE checkin_sessions SET is_open"));
    expect(updateCall).toBeUndefined();
  });

  it("writes is_open = true when the session was actually closed", async () => {
    baseMocks({ isOpen: false });
    const { GET } = await import("@/app/api/checkin/[scheduleId]/route");
    const res = await GET(makeReq(), { params: { scheduleId: "sched1" } });
    expect(res.status).toBe(200);
    const updateCall = sql.mock.calls.find(c => c[0].join("?").includes("UPDATE checkin_sessions SET is_open"));
    expect(updateCall).toBeTruthy();
  });
});
