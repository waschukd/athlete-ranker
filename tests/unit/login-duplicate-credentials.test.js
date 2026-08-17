// A user can end up with more than one auth_accounts credentials row (no
// unique constraint on userId+provider; a re-invite before their app-role
// row existed used to blindly INSERT a second row instead of updating the
// first). Login must check every row, not just the first one returned --
// otherwise a valid, just-emailed password can fail with "Invalid
// credentials" simply because a stale duplicate row sorts first.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ signToken: vi.fn(async () => "token123") }));
vi.mock("@/lib/password", () => ({
  verifyPassword: vi.fn(async (plain, hash) => hash === `hash(${plain})`),
  hashPassword: vi.fn(async (plain) => `hash(${plain})`),
}));

import sql from "@/lib/db";

function makeReq(body) {
  return new Request("http://test/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

function mockSqlByQuery(responses) {
  sql.mockImplementation(async (strings) => {
    const text = strings.join("?");
    for (const [match, result] of responses) {
      if (text.includes(match)) return typeof result === "function" ? result() : result;
    }
    return [];
  });
}

beforeEach(() => { vi.resetAllMocks(); });

describe("POST /api/auth/login — tolerates duplicate credentials rows", () => {
  it("logs in when the SECOND (not first) credentials row matches", async () => {
    mockSqlByQuery([
      ["FROM login_attempts", [{ c: 0 }]],
      ["FROM auth_users", [{ id: 133, email: "krista@test.com", name: "Krista" }]],
      ["FROM auth_accounts", [{ password: "hash(stale-old-password)" }, { password: "hash(new-temp-password)" }]],
      ["FROM users", [{ id: 164, email: "krista@test.com", role: "director" }]],
      ["FROM organizations", []],
    ]);
    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(makeReq({ email: "krista@test.com", password: "new-temp-password" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("still rejects when no row matches", async () => {
    mockSqlByQuery([
      ["FROM login_attempts", [{ c: 0 }]],
      ["FROM auth_users", [{ id: 133, email: "krista@test.com", name: "Krista" }]],
      ["FROM auth_accounts", [{ password: "hash(stale-old-password)" }, { password: "hash(other-password)" }]],
      ["INSERT INTO login_attempts", []],
    ]);
    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(makeReq({ email: "krista@test.com", password: "wrong-guess" }));
    expect(res.status).toBe(401);
  });
});
