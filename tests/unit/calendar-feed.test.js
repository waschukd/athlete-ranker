import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the token verifier to always resolve to a numeric user id, and the DB
// to return no sessions (so we only exercise the calendar header / VTIMEZONE
// scaffolding, not event rendering).
vi.mock("@/lib/calendar-token", () => ({
  verifyCalendarToken: vi.fn(() => 42),
}));

vi.mock("@/lib/db", () => ({
  default: vi.fn(async () => []),
}));

import { GET } from "@/app/api/evaluator/calendar/route";

function makeRequest(query = "token=anything") {
  return { url: `https://www.sidelinestar.com/api/evaluator/calendar?${query}` };
}

describe("evaluator calendar ICS feed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes a VTIMEZONE component for America/Edmonton", async () => {
    const res = await GET(makeRequest());
    const body = await res.text();
    expect(body).toContain("BEGIN:VTIMEZONE");
    expect(body).toContain("TZID:America/Edmonton");
    expect(body).toContain("END:VTIMEZONE");
    // VTIMEZONE must come before any VEVENT (here there are none, but it must
    // still sit inside the VCALENDAR after the header).
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("END:VCALENDAR");
  });

  it("serves inline by default", async () => {
    const res = await GET(makeRequest());
    expect(res.headers.get("content-disposition")).toContain("inline");
  });

  it("serves as an attachment when download=1", async () => {
    const res = await GET(makeRequest("token=anything&download=1"));
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="sidelinestar-sessions.ics"'
    );
  });

  it("returns 401 when the token is invalid", async () => {
    const mod = await import("@/lib/calendar-token");
    mod.verifyCalendarToken.mockReturnValueOnce(null);
    const res = await GET(makeRequest("token=bad"));
    expect(res.status).toBe(401);
  });
});
