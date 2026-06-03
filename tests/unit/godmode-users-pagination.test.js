import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireSuperAdmin: vi.fn() }));
vi.mock("@/lib/password", () => ({ hashPassword: vi.fn() }));

import sql from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";

// The neon `sql` tagged-template returns an array of rows. The route runs,
// in order: (1) the paged users query, (2) the count query, (3) the stats query.
// (sql fragments built with sql`` for WHERE clauses also invoke the mock, so we
// can't rely on call ordering by index alone — instead resolve by inspecting the
// SQL text the route awaits. We mockResolvedValue per shape using a helper.)

const STATS_ROW = {
  total: 12000,
  super_admins: 3,
  service_providers: 100,
  associations: 500,
  volunteers: 9000,
  new_this_week: 42,
};

// Flatten a tagged-template call's strings into one searchable string.
function sqlText(call) {
  const strings = call?.[0];
  if (Array.isArray(strings)) return strings.join(" ");
  return "";
}

// Route awaits fragments too (e.g. sql`WHERE ...`). To make awaits resolve
// deterministically, we route the return value based on the SQL text.
function installSqlRouter({ users = [], total = 0, stats = STATS_ROW } = {}) {
  sql.mockImplementation((strings) => {
    const text = Array.isArray(strings) ? strings.join(" ") : "";
    // count query
    if (/COUNT\(\*\)/i.test(text) && /FROM users/i.test(text) && !/FILTER/i.test(text)) {
      return Promise.resolve([{ total: String(total) }]);
    }
    // stats query (has FILTER clauses)
    if (/FILTER/i.test(text)) {
      return Promise.resolve([stats]);
    }
    // main users SELECT
    if (/SELECT/i.test(text) && /FROM users/i.test(text)) {
      return Promise.resolve(users);
    }
    // WHERE / fragment helpers — return a marker array so they can be embedded
    const frag = [];
    frag.__sqlStrings = strings;
    return frag;
  });
}

function makeReq(query = "") {
  return new Request(`http://test/api/admin/god-mode/users${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET god-mode users — pagination", () => {
  it("returns 403 when not a super admin", async () => {
    requireSuperAdmin.mockResolvedValue(null);
    const { GET } = await import("@/app/api/admin/god-mode/users/route");
    const res = await GET(makeReq());
    expect(res.status).toBe(403);
    expect(sql).not.toHaveBeenCalled();
  });

  it("returns the page slice + total + echoes page/pageSize + keeps stats", async () => {
    requireSuperAdmin.mockResolvedValue({ id: "admin1", role: "super_admin" });
    const pageUsers = [
      { id: "u1", name: "A", email: "a@x.com", organization_count: "2", total_assignments: "5" },
      { id: "u2", name: "B", email: "b@x.com", organization_count: "0", total_assignments: "0" },
    ];
    installSqlRouter({ users: pageUsers, total: 12000 });
    const { GET } = await import("@/app/api/admin/god-mode/users/route");
    const res = await GET(makeReq("?page=2&pageSize=2"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users).toHaveLength(2);
    expect(body.total).toBe(12000);
    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(2);
    expect(body.stats).toEqual(STATS_ROW);
    // numeric coercion preserved
    expect(body.users[0].organization_count).toBe(2);
    expect(body.users[0].total_assignments).toBe(5);

    // a LIMIT/OFFSET must be applied with the right values: page 2, size 2 => offset 2
    const mainCall = sql.mock.calls.find(
      (c) => /SELECT/i.test(sqlText(c)) && /FROM users/i.test(sqlText(c)) && !/FILTER/i.test(sqlText(c)) && !/^\s*COUNT/i.test(sqlText(c).trim())
    );
    expect(mainCall).toBeTruthy();
    const mainText = sqlText(mainCall);
    expect(mainText).toMatch(/LIMIT/i);
    expect(mainText).toMatch(/OFFSET/i);
    // pageSize (2) and offset (2) are passed as interpolated values
    expect(mainCall).toContain(2); // values array carries pageSize / offset
  });

  it("applies an ILIKE search when q is given, and the count reflects the filter", async () => {
    requireSuperAdmin.mockResolvedValue({ id: "admin1", role: "super_admin" });
    installSqlRouter({ users: [{ id: "u1", name: "Smith", email: "smith@x.com" }], total: 1 });
    const { GET } = await import("@/app/api/admin/god-mode/users/route");
    const res = await GET(makeReq("?page=1&pageSize=50&q=smith"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);

    // Some SQL the route built must include an ILIKE clause referencing name/email
    const anyIlike = sql.mock.calls.some((c) => /ILIKE/i.test(sqlText(c)));
    expect(anyIlike).toBe(true);

    // and the search term should be passed (wrapped with %) as an interpolated value
    const ilikeCall = sql.mock.calls.find((c) => /ILIKE/i.test(sqlText(c)));
    expect(JSON.stringify(ilikeCall)).toContain("%smith%");
  });

  it("caps pageSize at 200", async () => {
    requireSuperAdmin.mockResolvedValue({ id: "admin1", role: "super_admin" });
    installSqlRouter({ users: [], total: 0 });
    const { GET } = await import("@/app/api/admin/god-mode/users/route");
    const res = await GET(makeReq("?page=1&pageSize=999"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pageSize).toBe(200);
    // the LIMIT value passed to SQL is capped at 200
    const mainCall = sql.mock.calls.find(
      (c) => /SELECT/i.test(sqlText(c)) && /LIMIT/i.test(sqlText(c))
    );
    expect(mainCall).toContain(200);
  });

  it("defaults to page 1 / pageSize 50 when no params (back-compat)", async () => {
    requireSuperAdmin.mockResolvedValue({ id: "admin1", role: "super_admin" });
    installSqlRouter({ users: [], total: 0 });
    const { GET } = await import("@/app/api/admin/god-mode/users/route");
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(50);
  });
});
