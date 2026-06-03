import { describe, it, expect, vi, beforeEach } from "vitest";

// db is a tagged-template fn returning an array of rows.
vi.mock("@/lib/db", () => ({ default: vi.fn() }));
// auth: only requireSuperAdmin is used by the god-mode route.
vi.mock("@/lib/auth", () => ({ requireSuperAdmin: vi.fn() }));
// rate limiter: default to allowed; tests override per-case.
vi.mock("@/lib/rateLimit", () => ({
  checkAndRecord: vi.fn(async () => ({ allowed: true, count: 1 })),
  clientIp: vi.fn(() => "ip"),
}));
// password + email libs: no-op.
vi.mock("@/lib/password", () => ({ hashPassword: vi.fn(async () => "hashed") }));
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(),
  emailWelcomeAssociation: vi.fn(),
}));

import sql from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
import { checkAndRecord } from "@/lib/rateLimit";

// Flatten a tagged-template call's strings into one searchable string.
function sqlText(call) {
  const strings = call?.[0];
  return Array.isArray(strings) ? strings.join(" ") : "";
}
function calledWithSql(re) {
  return sql.mock.calls.some((c) => re.test(sqlText(c)));
}

function makeReq(body, { ip = "1.2.3.4" } = {}) {
  return new Request("http://test/api/auth/signup-request", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // default: every sql call resolves to [] unless a test overrides.
  sql.mockResolvedValue([]);
});

describe("POST /api/auth/signup-request (public submit)", () => {
  it("400 when association_name is missing", async () => {
    const { POST } = await import("@/app/api/auth/signup-request/route");
    const res = await POST(makeReq({ email: "a@b.com" }));
    expect(res.status).toBe(400);
    expect(calledWithSql(/INSERT INTO signup_requests/i)).toBe(false);
  });

  it("400 when email is missing or invalid", async () => {
    const { POST } = await import("@/app/api/auth/signup-request/route");
    let res = await POST(makeReq({ association_name: "Foo Hockey" }));
    expect(res.status).toBe(400);
    res = await POST(makeReq({ association_name: "Foo Hockey", email: "not-an-email" }));
    expect(res.status).toBe(400);
    expect(calledWithSql(/INSERT INTO signup_requests/i)).toBe(false);
  });

  it("429 when the rate limiter blocks", async () => {
    checkAndRecord.mockResolvedValueOnce({ allowed: false, count: 5 });
    const { POST } = await import("@/app/api/auth/signup-request/route");
    const res = await POST(makeReq({ association_name: "Foo Hockey", email: "a@b.com" }));
    expect(res.status).toBe(429);
    expect(calledWithSql(/INSERT INTO signup_requests/i)).toBe(false);
  });

  it("happy path inserts the request and returns success without leaking dupes", async () => {
    const { POST } = await import("@/app/api/auth/signup-request/route");
    const res = await POST(
      makeReq({ association_name: "Foo Hockey", contact_name: "Jane", email: "jane@foo.com", phone: "555", message: "hi" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(calledWithSql(/INSERT INTO signup_requests/i)).toBe(true);
  });
});

describe("GET /api/admin/god-mode/signup-requests", () => {
  it("403 when not a super admin", async () => {
    requireSuperAdmin.mockResolvedValue(null);
    const { GET } = await import("@/app/api/admin/god-mode/signup-requests/route");
    const res = await GET(new Request("http://test/api/admin/god-mode/signup-requests"));
    expect(res.status).toBe(403);
    expect(sql).not.toHaveBeenCalled();
  });

  it("returns pending requests for a super admin", async () => {
    requireSuperAdmin.mockResolvedValue({ id: "admin1", role: "super_admin" });
    sql.mockResolvedValueOnce([{ id: "r1", association_name: "Foo", status: "pending" }]);
    const { GET } = await import("@/app/api/admin/god-mode/signup-requests/route");
    const res = await GET(new Request("http://test/api/admin/god-mode/signup-requests"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.requests).toHaveLength(1);
  });
});

describe("POST /api/admin/god-mode/signup-requests", () => {
  function postReq(body) {
    return new Request("http://test/api/admin/god-mode/signup-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("403 when not a super admin", async () => {
    requireSuperAdmin.mockResolvedValue(null);
    const { POST } = await import("@/app/api/admin/god-mode/signup-requests/route");
    const res = await POST(postReq({ id: "r1", action: "approve" }));
    expect(res.status).toBe(403);
    expect(sql).not.toHaveBeenCalled();
  });

  it("deny only updates status to 'denied'", async () => {
    requireSuperAdmin.mockResolvedValue({ id: "admin1", role: "super_admin" });
    sql.mockResolvedValue([]);
    const { POST } = await import("@/app/api/admin/god-mode/signup-requests/route");
    const res = await POST(postReq({ id: "r1", action: "deny" }));
    expect(res.status).toBe(200);
    expect(calledWithSql(/UPDATE signup_requests[\s\S]*'denied'/i)).toBe(true);
    // deny must NOT provision anything
    expect(calledWithSql(/INSERT INTO organizations/i)).toBe(false);
    expect(calledWithSql(/INSERT INTO users/i)).toBe(false);
  });

  it("approve provisions org + user and marks the request approved", async () => {
    requireSuperAdmin.mockResolvedValue({ id: "admin1", role: "super_admin" });
    // Route by SQL text so order doesn't matter.
    sql.mockImplementation((strings) => {
      const text = Array.isArray(strings) ? strings.join(" ") : "";
      // load pending request
      if (/SELECT[\s\S]*FROM signup_requests/i.test(text)) {
        return Promise.resolve([
          { id: "r1", association_name: "Foo Hockey", contact_name: "Jane", email: "jane@foo.com", status: "pending" },
        ]);
      }
      // org code uniqueness check
      if (/FROM organizations WHERE org_code/i.test(text)) return Promise.resolve([]);
      // insert org returns the new org
      if (/INSERT INTO organizations/i.test(text)) return Promise.resolve([{ id: "org1", name: "Foo Hockey" }]);
      // auth_users insert/select
      if (/auth_users/i.test(text)) return Promise.resolve([{ id: "au1" }]);
      return Promise.resolve([]);
    });

    const { POST } = await import("@/app/api/admin/god-mode/signup-requests/route");
    const res = await POST(postReq({ id: "r1", action: "approve" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    expect(calledWithSql(/INSERT INTO organizations/i)).toBe(true);
    expect(calledWithSql(/INSERT INTO auth_users/i)).toBe(true);
    expect(calledWithSql(/INSERT INTO users/i)).toBe(true);
    expect(calledWithSql(/UPDATE signup_requests[\s\S]*'approved'/i)).toBe(true);
  });

  it("approve on a non-pending/unknown request returns 4xx and provisions nothing", async () => {
    requireSuperAdmin.mockResolvedValue({ id: "admin1", role: "super_admin" });
    sql.mockResolvedValue([]); // no pending request found
    const { POST } = await import("@/app/api/admin/god-mode/signup-requests/route");
    const res = await POST(postReq({ id: "missing", action: "approve" }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(calledWithSql(/INSERT INTO organizations/i)).toBe(false);
  });
});
