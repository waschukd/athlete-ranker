// Real incident: a tester's login attempts recorded as "Ryannjperrett@gmail.com"
// (a phone keyboard auto-capitalizing the field's first letter) against a
// stored "ryannjperrett@gmail.com" -- an exact-match lookup failed even
// though it was the right account and the right password. Email is
// case-insensitive in practice (Gmail and friends), so login must be too.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ signToken: vi.fn().mockResolvedValue("fake-token") }));
vi.mock("@/lib/password", () => ({
  verifyPassword: vi.fn().mockResolvedValue(true),
  hashPassword: vi.fn().mockResolvedValue("bcrypt-hash"),
}));

import sql from "@/lib/db";
import { verifyPassword } from "@/lib/password";

function makeReq(email, password) {
  return new Request("http://test/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

function mockSqlByQuery(responses) {
  sql.mockImplementation(async (strings) => {
    const text = strings.join("?");
    for (const [match, result] of responses) if (text.includes(match)) return result;
    return [];
  });
}

const STORED = { id: 220, email: "ryannjperrett@gmail.com", name: "Ryann Perrett" };

beforeEach(() => {
  vi.resetAllMocks();
  verifyPassword.mockResolvedValue(true);
});

describe("POST /api/auth/login — case-insensitive email", () => {
  it("logs in when the typed email's case doesn't match the stored case", async () => {
    mockSqlByQuery([
      ["WHERE ip = ", [{ c: 0 }]],
      ["WHERE email = ", [{ c: 0 }]],
      ["FROM auth_users WHERE LOWER(email) = LOWER", [STORED]],
      ["FROM auth_accounts WHERE", [{ password: "bcrypt-hash" }]],
      ["FROM users WHERE LOWER(email) = LOWER", [{ id: 255, email: "ryannjperrett@gmail.com", role: "service_provider_tester" }]],
      ["FROM organizations WHERE LOWER(contact_email)", []],
    ]);

    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(makeReq("Ryannjperrett@gmail.com", "correct-password"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.user.email).toBe("ryannjperrett@gmail.com");

    // The stored-side query used LOWER() so it matches regardless of stored casing.
    const authQuery = sql.mock.calls.map(c => c[0].join("?")).find(q => q.includes("FROM auth_users"));
    expect(authQuery).toContain("LOWER(email) = LOWER");
  });

  it("rate-limits by the normalized email, not the as-typed case", async () => {
    mockSqlByQuery([
      ["WHERE ip = ", [{ c: 0 }]],
      ["WHERE email = ", [{ c: 0 }]],
      ["FROM auth_users WHERE LOWER(email) = LOWER", []],
    ]);

    const { POST } = await import("@/app/api/auth/login/route");
    await POST(makeReq("SOMEONE@Example.com", "whatever"));

    const rateQuery = sql.mock.calls.find(c => {
      const text = c[0].join("?");
      return text.includes("FROM login_attempts") && text.includes("WHERE email");
    });
    expect(rateQuery[1]).toBe("someone@example.com");

    const insertCall = sql.mock.calls.find(c => c[0].join("?").includes("INSERT INTO login_attempts"));
    expect(insertCall[2]).toBe("someone@example.com");
  });

  it("still rejects an unknown email", async () => {
    mockSqlByQuery([
      ["WHERE ip = ", [{ c: 0 }]],
      ["WHERE email = ", [{ c: 0 }]],
      ["FROM auth_users WHERE LOWER(email) = LOWER", []],
    ]);
    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(makeReq("nobody@example.com", "whatever"));
    expect(res.status).toBe(401);
  });

  it("still rejects a wrong password for a real account", async () => {
    verifyPassword.mockResolvedValue(false);
    mockSqlByQuery([
      ["WHERE ip = ", [{ c: 0 }]],
      ["WHERE email = ", [{ c: 0 }]],
      ["FROM auth_users WHERE LOWER(email) = LOWER", [STORED]],
      ["FROM auth_accounts WHERE", [{ password: "bcrypt-hash" }]],
    ]);
    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(makeReq("ryannjperrett@gmail.com", "wrong-password"));
    expect(res.status).toBe(401);
  });
});
