// Backs the single-player "Email this player" button on the Athletes tab --
// a director asked for a way to send just ONE late-add player their welcome
// + ice time without re-blasting the whole roster (both existing batch
// sends only expose a per-family resend after the first batch already went
// out). This route tells the client whether the athlete is placed in a
// scheduled group yet, and which session_number to send the ice-time email
// for if so.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/authorize", () => ({ authorizeCategoryAccess: vi.fn() }));

import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { GET } from "@/app/api/categories/[catId]/athletes/[athleteId]/current-session/route";

function makeReq() {
  return new Request("http://test/api/categories/97/athletes/501/current-session");
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ email: "director@test", role: "director" });
  authorizeCategoryAccess.mockResolvedValue({ authorized: true });
});

describe("GET /api/categories/[catId]/athletes/[athleteId]/current-session", () => {
  it("401s an unauthenticated caller", async () => {
    getSession.mockResolvedValue(null);
    const res = await GET(makeReq(), { params: { catId: "97", athleteId: "501" } });
    expect(res.status).toBe(401);
  });

  it("403s a caller without category access", async () => {
    authorizeCategoryAccess.mockResolvedValue({ authorized: false });
    const res = await GET(makeReq(), { params: { catId: "97", athleteId: "501" } });
    expect(res.status).toBe(403);
    expect(sql).not.toHaveBeenCalled();
  });

  it("reports no schedule when the athlete isn't placed in a scheduled group", async () => {
    sql.mockResolvedValueOnce([]);
    const res = await GET(makeReq(), { params: { catId: "97", athleteId: "501" } });
    const body = await res.json();
    expect(body.hasSchedule).toBe(false);
    expect(body.session_number).toBeNull();
  });

  it("returns the most recent session_number with a real date/time set", async () => {
    sql.mockResolvedValueOnce([{ session_number: 3 }]);
    const res = await GET(makeReq(), { params: { catId: "97", athleteId: "501" } });
    const body = await res.json();
    expect(body.hasSchedule).toBe(true);
    expect(body.session_number).toBe(3);
  });

  it("only looks at groups actually scheduled with a date and start time", async () => {
    const res = await GET(makeReq(), { params: { catId: "97", athleteId: "501" } });
    await res.json();
    const q = sql.mock.calls[0][0].join("?");
    expect(q).toMatch(/es\.scheduled_date IS NOT NULL/);
    expect(q).toMatch(/es\.start_time IS NOT NULL/);
    expect(q).toMatch(/ORDER BY sg\.session_number DESC/);
  });
});
