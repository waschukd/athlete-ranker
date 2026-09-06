// Real request: a tester's results file included a kid who'd genuinely
// tested at EFHA U11 Community but was never in the app's roster. Getting
// silently "skipped" meant their results just vanished with no record they'd
// even shown up. Now a name that matches nobody gets registered fresh
// instead of dropped, and the admin is told exactly who got added so they
// can catch it if it was actually a typo of an existing player.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/authorize", () => ({ authorizeCategoryAccess: vi.fn() }));
vi.mock("@/lib/scheduleNotify", () => ({ notifyTestingResultsUploaded: vi.fn().mockResolvedValue(undefined) }));

import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";

function makeReq(body) {
  return new Request("http://test/api/categories/95/testing-upload", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

function mockSqlByQuery(responses) {
  sql.mockImplementation(async (strings) => {
    const text = strings.join("?");
    for (const [match, result] of responses) if (text.includes(match)) return result;
    return [];
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ email: "assoc@test", role: "association_admin" });
  authorizeCategoryAccess.mockResolvedValue({ authorized: true });
});

describe("POST /api/categories/[catId]/testing-upload — auto-creates unmatched names", () => {
  it("registers a name that matches nobody, and reports it as created", async () => {
    mockSqlByQuery([
      ["FROM athletes\n      WHERE age_category_id", [{ id: 1, first_name: "Amy", last_name: "Baker" }]],
      ["SELECT organization_id FROM age_categories", [{ organization_id: 49 }]],
      ["INSERT INTO athletes", [{ id: 999, first_name: "New", last_name: "Kid" }]],
    ]);

    const { POST } = await import("@/app/api/categories/[catId]/testing-upload/route");
    const res = await POST(makeReq({
      session_number: 1,
      results: [{ first_name: "New", last_name: "Kid", overall_rank: 5, tests: [] }],
    }), { params: { catId: "95" } });

    const body = await res.json();
    expect(body).toMatchObject({ success: true, matched: 1, created: 1, skipped: 0, created_names: ["New Kid"] });

    const insertCall = sql.mock.calls.find(c => c[0].join("?").includes("INSERT INTO athletes"));
    expect(insertCall).toBeTruthy();
    // [stringsArray, orgId, catId, rawFirst, rawLast] -- is_active/notes are literal SQL, not bound params
    expect(insertCall[1]).toBe(49); // organization_id bound param
    expect(insertCall[3]).toBe("New"); // raw (non-lowercased) first_name preserved
    expect(insertCall[4]).toBe("Kid");

    // The new athlete_id (999) should also get a testing_drill_results row.
    const drillInsert = sql.mock.calls.find(c => c[0].join("?").includes("INSERT INTO testing_drill_results"));
    expect(drillInsert[1]).toBe(999);
  });

  it("still matches an existing athlete by exact name instead of creating a duplicate", async () => {
    mockSqlByQuery([
      ["FROM athletes\n      WHERE age_category_id", [{ id: 1, first_name: "Amy", last_name: "Baker" }]],
    ]);
    const { POST } = await import("@/app/api/categories/[catId]/testing-upload/route");
    const res = await POST(makeReq({
      session_number: 1,
      results: [{ first_name: "amy", last_name: "baker", overall_rank: 2, tests: [] }],
    }), { params: { catId: "95" } });
    const body = await res.json();
    expect(body).toMatchObject({ matched: 1, created: 0, skipped: 0 });
    expect(sql.mock.calls.some(c => c[0].join("?").includes("INSERT INTO athletes"))).toBe(false);
  });

  it("still skips a row with no name or no parseable rank, rather than creating garbage", async () => {
    mockSqlByQuery([
      ["FROM athletes\n      WHERE age_category_id", []],
    ]);
    const { POST } = await import("@/app/api/categories/[catId]/testing-upload/route");
    const res = await POST(makeReq({
      session_number: 1,
      results: [{ first_name: "", last_name: "Nobody", overall_rank: 3, tests: [] }],
    }), { params: { catId: "95" } });
    const body = await res.json();
    expect(body).toMatchObject({ matched: 0, created: 0, skipped: 1 });
    expect(sql.mock.calls.some(c => c[0].join("?").includes("INSERT INTO athletes"))).toBe(false);
  });

  it("creates only once when the same new name appears twice in one file", async () => {
    let athleteRows = [];
    sql.mockImplementation(async (strings, ...vals) => {
      const text = strings.join("?");
      if (text.includes("FROM athletes\n      WHERE age_category_id")) return athleteRows;
      if (text.includes("SELECT organization_id FROM age_categories")) return [{ organization_id: 49 }];
      if (text.includes("INSERT INTO athletes")) {
        const row = { id: 999, first_name: "New", last_name: "Kid" };
        athleteRows = [...athleteRows, row];
        return [row];
      }
      return [];
    });

    const { POST } = await import("@/app/api/categories/[catId]/testing-upload/route");
    const res = await POST(makeReq({
      session_number: 1,
      results: [
        { first_name: "New", last_name: "Kid", overall_rank: 5, tests: [] },
        { first_name: "new", last_name: "kid", overall_rank: 5, tests: [] }, // dupe row in the same upload
      ],
    }), { params: { catId: "95" } });
    const body = await res.json();
    expect(body).toMatchObject({ matched: 2, created: 1 });
    expect(sql.mock.calls.filter(c => c[0].join("?").includes("INSERT INTO athletes")).length).toBe(1);
  });
});
