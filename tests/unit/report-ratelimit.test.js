// Verifies the public report GET is rate-limited per IP BEFORE any heavy DB
// work. We mock @/lib/db so the very first query the request makes (the
// limiter's COUNT) reports the IP is already over the cap; the route must
// then return 429 without running any of its lookup/scoring queries.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ logEvent: vi.fn() }));

import sql from "@/lib/db";
import { logEvent } from "@/lib/analytics";
import { GET } from "@/app/api/report/[token]/route";

beforeEach(() => {
  vi.clearAllMocks();
});

function makeReq(ip = "9.9.9.9") {
  return new Request("http://test/api/report/sometoken", {
    headers: { "x-forwarded-for": ip },
  });
}

describe("GET /api/report/[token] rate limiting", () => {
  it("returns 429 and skips report work when the IP is over the limit", async () => {
    // First (and only) sql call should be the limiter's COUNT — report it at
    // the cap (max=60) so checkAndRecord returns allowed:false.
    sql.mockResolvedValueOnce([{ c: 60 }]);

    const res = await GET(makeReq(), { params: { token: "sometoken" } });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toMatch(/too many requests/i);

    // Only the limiter COUNT ran — no INSERT, no link lookup, no scoring.
    expect(sql).toHaveBeenCalledTimes(1);
    // The heavy path also logs a view event; it must not have fired.
    expect(logEvent).not.toHaveBeenCalled();
  });

  it("proceeds past the limiter when under the limit", async () => {
    // Limiter: COUNT under cap, then INSERT.
    sql.mockResolvedValueOnce([{ c: 1 }]); // COUNT
    sql.mockResolvedValueOnce([]); // limiter INSERT
    // Report link lookup returns nothing → 404 (cheap, proves we got past 429).
    sql.mockResolvedValueOnce([]); // link lookup

    const res = await GET(makeReq(), { params: { token: "sometoken" } });
    expect(res.status).toBe(404);
    // limiter COUNT + limiter INSERT + link lookup
    expect(sql).toHaveBeenCalledTimes(3);
  });
});
