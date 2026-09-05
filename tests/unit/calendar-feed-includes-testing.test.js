// Real incident: Donald Milburn (evaluator AND tester -- two separate
// memberships, see lib/testers.js) reported evaluation sessions showing up
// fine "in sessions and calendars", but a testing session he signed up for
// never did. The in-app dashboard already merges both into one "My
// Sessions" list for a dual-role person -- this feed didn't, because it
// only ever selected from evaluator_session_signups. Testing signups live
// in a separate tester_session_signups table.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/calendar-token", () => ({ verifyCalendarToken: vi.fn(() => 137) }));
vi.mock("@/lib/db", () => ({ default: vi.fn() }));

import sql from "@/lib/db";
import { GET } from "@/app/api/evaluator/calendar/route";

function makeRequest(query = "token=anything") {
  return { url: `https://www.sidelinestar.com/api/evaluator/calendar?${query}` };
}

function mockSqlByQuery(responses) {
  sql.mockImplementation(async (strings) => {
    const text = strings.join("?");
    for (const [match, result] of responses) if (text.includes(match)) return result;
    return [];
  });
}

beforeEach(() => { vi.clearAllMocks(); });

describe("evaluator calendar feed also includes testing signups", () => {
  it("emits a VEVENT for a testing session, labeled distinctly from an eval one", async () => {
    mockSqlByQuery([
      ["FROM evaluator_session_signups", [{
        schedule_id: 1, scheduled_date: "2026-09-10", start_time: "18:00:00", end_time: "19:00:00",
        location: "Rink A", session_number: 2, group_number: 1,
        category_name: "U11 AA", org_name: "BAHA", updated_at: null, created_at: "2026-09-01",
      }]],
      ["FROM tester_session_signups", [{
        schedule_id: 2, scheduled_date: "2026-09-11", start_time: "20:00:00", end_time: "21:00:00",
        location: "Rink B", session_number: 1, group_number: 4,
        category_name: "U15", org_name: "SEERA U15", updated_at: null, created_at: "2026-09-01",
      }]],
    ]);

    const res = await GET(makeRequest());
    const body = await res.text();

    expect(body).toContain("SUMMARY:Eval: BAHA U11 AA S2G1");
    expect(body).toContain("SUMMARY:Testing: SEERA U15 U15");
    expect(body).toContain("UID:signup-1-137@sidelinestar.com");
    expect(body).toContain("UID:tester-2-137@sidelinestar.com");
  });

  it("still returns only evaluation events for someone with no testing signups", async () => {
    mockSqlByQuery([
      ["FROM evaluator_session_signups", [{
        schedule_id: 1, scheduled_date: "2026-09-10", start_time: "18:00:00", end_time: "19:00:00",
        location: "Rink A", session_number: 2, group_number: 1,
        category_name: "U11 AA", org_name: "BAHA", updated_at: null, created_at: "2026-09-01",
      }]],
      ["FROM tester_session_signups", []],
    ]);

    const res = await GET(makeRequest());
    const body = await res.text();

    expect(body).toContain("SUMMARY:Eval: BAHA U11 AA S2G1");
    expect(body).not.toContain("Testing:");
  });
});
