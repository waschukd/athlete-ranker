// "Watch this player" flags: a director reviewing a session's groups notices
// someone ranked too high/low and flags them for their upcoming session, so
// whichever evaluator scores them next sees a star. Session-scoped, separate
// from anchor_players (which drives the score-correction formula).
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/authorize", () => ({ authorizeCategoryAccess: vi.fn() }));

import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { GET, POST } from "@/app/api/categories/[catId]/watch-players/route";

function makeReq(url, body) {
  return new Request(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
}

beforeEach(() => {
  vi.clearAllMocks();
  authorizeCategoryAccess.mockResolvedValue({ authorized: true });
});

describe("GET /api/categories/[catId]/watch-players", () => {
  it("401s an unauthenticated caller", async () => {
    getSession.mockResolvedValue(null);
    const res = await GET(makeReq("http://test/api/categories/90/watch-players?session_number=3"), { params: { catId: "90" } });
    expect(res.status).toBe(401);
  });

  it("400s without session_number", async () => {
    getSession.mockResolvedValue({ email: "d@test", role: "director" });
    const res = await GET(makeReq("http://test/api/categories/90/watch-players"), { params: { catId: "90" } });
    expect(res.status).toBe(400);
  });

  it("returns flagged athletes for the requested session", async () => {
    getSession.mockResolvedValue({ email: "d@test", role: "director" });
    sql.mockResolvedValueOnce(undefined); // ensureTable CREATE TABLE
    sql.mockResolvedValueOnce([{ athlete_id: 101, note: null }]);
    const res = await GET(makeReq("http://test/api/categories/90/watch-players?session_number=3"), { params: { catId: "90" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.watched).toEqual([{ athlete_id: 101, note: null }]);
  });
});

describe("POST /api/categories/[catId]/watch-players", () => {
  it("403s a plain evaluator (not a manage role)", async () => {
    getSession.mockResolvedValue({ email: "e@test", role: "association_evaluator" });
    const res = await POST(makeReq("http://test/api/categories/90/watch-players", { athlete_id: 101, session_number: 3 }), { params: { catId: "90" } });
    expect(res.status).toBe(403);
    expect(sql).not.toHaveBeenCalled();
  });

  it("flags a player -- upserts on conflict rather than erroring on a re-flag", async () => {
    getSession.mockResolvedValue({ email: "d@test", role: "director" });
    sql.mockResolvedValueOnce(undefined); // ensureTable
    sql.mockResolvedValueOnce([{ id: 5 }]); // user lookup
    sql.mockResolvedValueOnce(undefined); // insert/upsert
    const res = await POST(makeReq("http://test/api/categories/90/watch-players", { action: "flag", athlete_id: 101, session_number: 3 }), { params: { catId: "90" } });
    expect(res.status).toBe(200);
    const insertQuery = sql.mock.calls[2][0].join("?");
    expect(insertQuery).toContain("ON CONFLICT");
  });

  it("unflags a player", async () => {
    getSession.mockResolvedValue({ email: "d@test", role: "director" });
    sql.mockResolvedValueOnce(undefined); // ensureTable
    sql.mockResolvedValueOnce([{ id: 5 }]); // user lookup
    sql.mockResolvedValueOnce(undefined); // delete
    const res = await POST(makeReq("http://test/api/categories/90/watch-players", { action: "unflag", athlete_id: 101, session_number: 3 }), { params: { catId: "90" } });
    expect(res.status).toBe(200);
    const deleteQuery = sql.mock.calls[2][0].join("?");
    expect(deleteQuery).toContain("DELETE FROM watch_players");
  });
});
