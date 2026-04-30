// Regression tests for the new rate-limit gates on /api/auth/login,
// /api/auth/forgot-password, and /api/auth/reset-password. We mock
// the sql tagged-template so each test queues the responses the
// handler would see from Postgres, then assert the HTTP status.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  signToken: vi.fn(async () => "fake.jwt.token"),
  verifyToken: vi.fn(),
  getSession: vi.fn(),
  getCurrentUser: vi.fn(),
  getAppUserId: vi.fn(),
  resolveSpOrgId: vi.fn(),
}));
vi.mock("@/lib/password", () => ({
  verifyPassword: vi.fn(),
  hashPassword: vi.fn(async () => "$2b$10$fakehash"),
}));
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined }) }));

process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-secret-for-rate-limit-suite";

import sql from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { sendEmail } from "@/lib/email";

beforeEach(() => {
  vi.clearAllMocks();
});

function reqJson(url, body) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.1" },
    body: JSON.stringify(body),
  });
}

describe("/api/auth/login rate limit", () => {
  it("returns 429 when IP failure count is at the limit (20)", async () => {
    sql.mockResolvedValueOnce([{ c: 20 }]); // ip count == limit
    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(reqJson("http://test/api/auth/login", { email: "user@a.test", password: "x" }));
    expect(res.status).toBe(429);
  });

  it("returns 429 when email failure count is at the limit (5)", async () => {
    sql.mockResolvedValueOnce([{ c: 0 }]);  // ip count under limit
    sql.mockResolvedValueOnce([{ c: 5 }]);  // email count == limit
    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(reqJson("http://test/api/auth/login", { email: "user@a.test", password: "x" }));
    expect(res.status).toBe(429);
  });

  it("records a failure row when password is wrong", async () => {
    sql.mockResolvedValueOnce([{ c: 0 }]);                     // ip count
    sql.mockResolvedValueOnce([{ c: 0 }]);                     // email count
    sql.mockResolvedValueOnce([{ id: "u1", email: "user@a.test", name: "U" }]); // auth_users
    sql.mockResolvedValueOnce([{ password: "$2b$10$stored" }]); // accounts
    verifyPassword.mockResolvedValueOnce(false);                // wrong password
    sql.mockResolvedValueOnce([]);                              // INSERT login_attempts
    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(reqJson("http://test/api/auth/login", { email: "user@a.test", password: "wrong" }));
    expect(res.status).toBe(401);
    // 5 sql calls were made; the last one is the INSERT into login_attempts
    expect(sql).toHaveBeenCalledTimes(5);
  });

  it("does NOT record a failure when login succeeds", async () => {
    sql.mockResolvedValueOnce([{ c: 0 }]);                     // ip count
    sql.mockResolvedValueOnce([{ c: 0 }]);                     // email count
    sql.mockResolvedValueOnce([{ id: "u1", email: "user@a.test", name: "U" }]); // auth_users
    sql.mockResolvedValueOnce([{ password: "$2b$10$stored" }]); // accounts
    verifyPassword.mockResolvedValueOnce(true);                 // correct password
    sql.mockResolvedValueOnce([{ id: "appu1", role: "association_evaluator" }]); // app users
    sql.mockResolvedValueOnce([]);                              // organizations lookup
    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(reqJson("http://test/api/auth/login", { email: "user@a.test", password: "right" }));
    expect(res.status).toBe(200);
    // No INSERT login_attempts call should appear; total sql calls = 6
    // (2 rate checks + auth_users + accounts + app users + org lookup)
    expect(sql).toHaveBeenCalledTimes(6);
  });
});

describe("/api/auth/forgot-password rate limit", () => {
  it("returns 429 when IP hits the per-hour limit (5)", async () => {
    sql.mockResolvedValueOnce([{ c: 5 }]); // ip count == limit
    const { POST } = await import("@/app/api/auth/forgot-password/route");
    const res = await POST(reqJson("http://test/api/auth/forgot-password", { email: "user@a.test" }));
    expect(res.status).toBe(429);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("returns 200 + does not send email when per-email limit is hit (no enumeration)", async () => {
    sql.mockResolvedValueOnce([{ c: 0 }]); // ip count under
    sql.mockResolvedValueOnce([]);          // INSERT auth_rate_limit (recordAttempt)
    sql.mockResolvedValueOnce([{ id: "u1", email: "user@a.test" }]); // auth_users hit
    sql.mockResolvedValueOnce([{ c: 3 }]);  // email count == limit
    const { POST } = await import("@/app/api/auth/forgot-password/route");
    const res = await POST(reqJson("http://test/api/auth/forgot-password", { email: "user@a.test" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("/api/auth/reset-password rate limit", () => {
  it("returns 429 when IP hits the limit (10)", async () => {
    sql.mockResolvedValueOnce([{ c: 10 }]); // ip count == limit
    const { POST } = await import("@/app/api/auth/reset-password/route");
    const res = await POST(reqJson("http://test/api/auth/reset-password", { token: "abc", password: "longenough" }));
    expect(res.status).toBe(429);
  });

  it("records an attempt for invalid token submissions", async () => {
    sql.mockResolvedValueOnce([{ c: 0 }]); // ip count under
    sql.mockResolvedValueOnce([]);          // SELECT password_reset_tokens (none)
    sql.mockResolvedValueOnce([]);          // INSERT auth_rate_limit (recordAttempt)
    const { POST } = await import("@/app/api/auth/reset-password/route");
    const res = await POST(reqJson("http://test/api/auth/reset-password", { token: "bad", password: "longenough" }));
    expect(res.status).toBe(400);
    expect(sql).toHaveBeenCalledTimes(3);
  });
});
