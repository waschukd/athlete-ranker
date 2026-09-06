import { describe, it, expect, vi, beforeEach } from "vitest";

// The upload matched an unrostered name to any athlete with the same last name
// whose first name shared its first LETTER. EFHA U11 has Michelle Xu on the
// roster and a Meghan Xu who tested but was never added: Meghan matched
// Michelle on "same surname, both start with M" and wrote her times over
// Michelle's. Two sisters do the same thing, and nothing reports it -- the
// upload says "matched", and one girl silently carries another's results.
//
// A shared initial is a coincidence, not a nickname. One first name has to be a
// prefix of the other, and an ambiguous pair stays unmatched rather than guessed.

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/authorize", () => ({ authorizeCategoryAccess: vi.fn() }));
vi.mock("@/lib/scheduleNotify", () => ({ notifyTestingResultsUploaded: vi.fn().mockResolvedValue(undefined) }));

import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";

const req = (body) => new Request("http://test/api/categories/95/testing-upload", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

function mockRoster(roster, newId = 999) {
  let next = newId;
  sql.mockImplementation(async (strings, ...params) => {
    const text = strings.join("?");
    if (text.includes("FROM athletes\n      WHERE age_category_id")) return roster;
    if (text.includes("SELECT organization_id FROM age_categories")) return [{ organization_id: 49 }];
    // Echo the name actually inserted -- params are [orgId, catId, first, last, note].
    if (text.includes("INSERT INTO athletes")) {
      return [{ id: next++, first_name: params[2], last_name: params[3] }];
    }
    return [];
  });
}

async function upload(results) {
  const { POST } = await import("@/app/api/categories/[catId]/testing-upload/route");
  const res = await POST(req({ session_number: 1, results }), { params: { catId: "95" } });
  return res.json();
}

const row = (first, last, rank = 5) => ({ first_name: first, last_name: last, overall_rank: rank, tests: [] });

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ email: "a@t", role: "association_admin" });
  authorizeCategoryAccess.mockResolvedValue({ authorized: true });
});

describe("an unrostered name is not absorbed by a same-surname teammate", () => {
  it("does not give Meghan Xu's results to Michelle Xu", async () => {
    mockRoster([{ id: 3820, first_name: "Michelle", last_name: "Xu" }]);
    const body = await upload([row("Meghan", "Xu")]);
    // Meghan is a real skater missing from the roster: register her.
    expect(body.created).toBe(1);
    expect(body.created_names).toEqual(["Meghan Xu"]);
  });

  it("keeps two same-surname skaters on separate records", async () => {
    mockRoster([{ id: 3820, first_name: "Michelle", last_name: "Xu" }]);
    const body = await upload([row("Meghan", "Xu", 94), row("Michelle", "Xu", 54)]);
    const drill = sql.mock.calls.find(c => c[0].join("?").includes("INSERT INTO testing_drill_results"));
    const ids = drill[1];
    expect(new Set(ids).size).toBe(2);   // two distinct athletes, not one overwritten twice
    expect(ids).toContain(3820);
    expect(ids).toContain(999);
  });

  it("still accepts a genuine shortening of the same name", async () => {
    mockRoster([{ id: 7, first_name: "Meghan", last_name: "Xu" }]);
    const body = await upload([row("Meg", "Xu")]);
    expect(body.created).toBe(0);
    expect(body.matched).toBe(1);
  });

  it("accepts the reverse: full name uploaded against a shortened roster entry", async () => {
    mockRoster([{ id: 7, first_name: "Alex", last_name: "Hourie" }]);
    const body = await upload([row("Alexander", "Hourie")]);
    expect(body.created).toBe(0);
    expect(body.matched).toBe(1);
  });

  it("refuses to guess when two roster entries are equally plausible", async () => {
    // "Sam" fits both. Creating a fresh record is recoverable; silently
    // attaching one girl's times to her sister is not.
    mockRoster([
      { id: 1, first_name: "Samantha", last_name: "Reid" },
      { id: 2, first_name: "Samira", last_name: "Reid" },
    ]);
    const body = await upload([row("Sam", "Reid")]);
    expect(body.matched).toBe(1);
    expect(body.created).toBe(1);
  });

  it("an exact match still wins outright", async () => {
    mockRoster([
      { id: 1, first_name: "Michelle", last_name: "Xu" },
      { id: 2, first_name: "Meghan", last_name: "Xu" },
    ]);
    const body = await upload([row("Michelle", "Xu")]);
    expect(body.created).toBe(0);
    const drill = sql.mock.calls.find(c => c[0].join("?").includes("INSERT INTO testing_drill_results"));
    expect(drill[1]).toEqual([1]);
  });

  it("a misspelling still reaches the right athlete via fuzzy match", async () => {
    // The EFHA export writes "Chloé" as "Chlo_".
    mockRoster([{ id: 4, first_name: "Chloe", last_name: "Kellman Murphy" }]);
    const body = await upload([row("Chlo_", "Kellman Murphy")]);
    expect(body.created).toBe(0);
    expect(body.fuzzy_matched).toBe(1);
  });
});
