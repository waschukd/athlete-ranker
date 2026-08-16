// Regression coverage: viewing/managing the roster of an SP-owned testing
// event (age_category_id NULL, hangs off service_provider_id instead of an
// association) used to always 403, even for the SP admin who owns it — the
// route resolved authorization off organization_id, which is null for these
// rows. governingOrgId() falls back to service_provider_id so these sessions
// are authorized like any other SP-managed session.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn(), getAppUserId: vi.fn() }));
vi.mock("@/lib/authorize", () => ({ canManageSessionAssignments: vi.fn() }));
vi.mock("@/lib/sessionRoster", () => ({ eligiblePeople: vi.fn(async () => []), eligibilityOf: vi.fn() }));

import sql from "@/lib/db";
import { getSession, getAppUserId } from "@/lib/auth";
import { canManageSessionAssignments } from "@/lib/authorize";
import { eligibilityOf } from "@/lib/sessionRoster";

function makeReq() {
  return new Request("http://test/api/schedule/99/roster");
}

// loadSession's single SELECT — its shape is what the route reads (organization_id,
// service_provider_id, etc); rosterFor's two SELECTs (evaluators, testers) follow
// when the caller passes canView.
function queueSession(row) {
  sql.mockResolvedValueOnce([row]);
  sql.mockResolvedValueOnce([]); // evaluators
  sql.mockResolvedValueOnce([]); // testers
}

beforeEach(() => {
  // resetAllMocks (not clearAllMocks) — clearAllMocks leaves queued
  // mockResolvedValueOnce entries in place, so a test that short-circuits
  // before consuming all of them leaks stale queued values into the next test.
  vi.resetAllMocks();
  getSession.mockResolvedValue({ email: "sp@test" });
  getAppUserId.mockResolvedValue("user1");
});

describe("GET /api/schedule/[scheduleId]/roster — SP-owned testing events", () => {
  it("authorizes the owning SP admin instead of 403ing on a null organization_id", async () => {
    queueSession({ id: 99, age_category_id: null, organization_id: null, service_provider_id: 42, org_name: null });
    canManageSessionAssignments.mockResolvedValue({ authorized: true, reason: "assoc_admin_inhouse" });

    const { GET } = await import("@/app/api/schedule/[scheduleId]/roster/route");
    const res = await GET(makeReq(), { params: { scheduleId: "99" } });

    // The critical assertion: it must be asked to authorize against the SP's
    // own id (42), not null — that's the exact bug (orgId was s.organization_id,
    // always null for these rows, so canManageSessionAssignments was never even
    // consulted with the real owning org).
    expect(canManageSessionAssignments).toHaveBeenCalledWith(expect.anything(), 42);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.canManage).toBe(true);
  });

  it("still 403s an unrelated caller with no eligibility on the SP-owned event", async () => {
    queueSession({ id: 99, age_category_id: null, organization_id: null, service_provider_id: 42, org_name: null });
    canManageSessionAssignments.mockResolvedValue({ authorized: false, reason: "not_authorized" });
    eligibilityOf.mockResolvedValue({ evaluator: false, tester: false });

    const { GET } = await import("@/app/api/schedule/[scheduleId]/roster/route");
    const res = await GET(makeReq(), { params: { scheduleId: "99" } });

    expect(eligibilityOf).toHaveBeenCalledWith(42, "user1");
    expect(res.status).toBe(403);
  });

  it("association-owned sessions still authorize off organization_id as before", async () => {
    queueSession({ id: 5, age_category_id: 7, organization_id: 11, service_provider_id: null, org_name: "Acme" });
    canManageSessionAssignments.mockResolvedValue({ authorized: true, reason: "lead" });

    const { GET } = await import("@/app/api/schedule/[scheduleId]/roster/route");
    const res = await GET(makeReq(), { params: { scheduleId: "5" } });

    expect(canManageSessionAssignments).toHaveBeenCalledWith(expect.anything(), 11);
    expect(res.status).toBe(200);
  });
});
