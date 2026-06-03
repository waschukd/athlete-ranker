// Unit tests for the reusable DB-backed sliding-window limiter in
// src/lib/rateLimit.js. We mock the sql tagged-template so each test
// controls what the COUNT query returns, then assert allowed/count and
// whether an INSERT was attempted.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));

import sql from "@/lib/db";
import { checkAndRecord } from "@/lib/rateLimit";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkAndRecord", () => {
  it("allows and records when under the limit", async () => {
    sql.mockResolvedValueOnce([{ c: 3 }]); // current count
    sql.mockResolvedValueOnce([]); // INSERT
    const res = await checkAndRecord({ endpoint: "test", identifier: "1.2.3.4", max: 5, windowMins: 1 });
    expect(res.allowed).toBe(true);
    expect(res.count).toBe(4);
    // 2 calls: the SELECT count + the INSERT
    expect(sql).toHaveBeenCalledTimes(2);
  });

  it("blocks and does NOT insert when at/over the limit", async () => {
    sql.mockResolvedValueOnce([{ c: 5 }]); // count == max
    const res = await checkAndRecord({ endpoint: "test", identifier: "1.2.3.4", max: 5, windowMins: 1 });
    expect(res.allowed).toBe(false);
    expect(res.count).toBe(5);
    // Only the SELECT ran — no INSERT
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it("fails OPEN (allowed) when the DB query throws", async () => {
    sql.mockRejectedValueOnce(new Error("connection refused"));
    const res = await checkAndRecord({ endpoint: "test", identifier: "1.2.3.4", max: 5, windowMins: 1 });
    expect(res.allowed).toBe(true);
    expect(res.count).toBe(0);
  });
});
