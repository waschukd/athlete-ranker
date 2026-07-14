import { describe, it, expect } from "vitest";
import { deriveSessions } from "@/lib/bulkSessions";

const weightsBySession = (rows) => {
  const { sessions } = deriveSessions(rows);
  const total = sessions.reduce((s, x) => s + x.weight, 0);
  return { sessions: sessions.sort((a, b) => a.session_number - b.session_number), total };
};

describe("deriveSessions — honors the Session # column", () => {
  it("U11 HOUSE: 1 testing + 3 scored (one date each) → 10/30/30/30", () => {
    const rows = [
      { session_number: 1, session_type: "testing", date: "2026-09-06" },
      { session_number: 2, session_type: "scrimmage", date: "2026-09-10" },
      { session_number: 3, session_type: "scrimmage", date: "2026-09-12" },
      { session_number: 4, session_type: "scrimmage", date: "2026-09-13" },
    ];
    const { sessions, total } = weightsBySession(rows);
    expect(total).toBe(100);
    expect(sessions.map(s => s.weight)).toEqual([10, 30, 30, 30]);
    expect(sessions[0].type).toBe("testing");
  });

  it("U18 HOUSE: 4 scored sessions spread across 7 dates → 4 sessions at 25 (NOT 7)", () => {
    const rows = [
      { session_number: 1, session_type: "scrimmage", date: "2026-09-24" },
      { session_number: 1, session_type: "scrimmage", date: "2026-09-26" },
      { session_number: 1, session_type: "scrimmage", date: "2026-09-23" },
      { session_number: 2, session_type: "scrimmage", date: "2026-09-27" },
      { session_number: 2, session_type: "scrimmage", date: "2026-09-25" },
      { session_number: 3, session_type: "scrimmage", date: "2026-09-30" },
      { session_number: 3, session_type: "scrimmage", date: "2026-09-29" },
      { session_number: 4, session_type: "scrimmage", date: "2026-09-23" },
    ];
    const { sessions, total } = weightsBySession(rows);
    expect(sessions.length).toBe(4);
    expect(total).toBe(100);
    expect(sessions.map(s => s.weight)).toEqual([25, 25, 25, 25]);
  });

  it("U9 HOUSE: Skills counts as a SCORED session, not testing", () => {
    const rows = [
      { session_number: 1, session_type: "testing", date: "2026-09-06" },
      { session_number: 2, session_type: "skills", date: "2026-09-07" },
      { session_number: 3, session_type: "scrimmage", date: "2026-09-12" },
      { session_number: 4, session_type: "scrimmage", date: "2026-09-13" },
    ];
    const { sessions, total } = weightsBySession(rows);
    expect(total).toBe(100);
    expect(sessions.find(s => s.session_number === 2).type).toBe("scrimmage");
    expect(sessions.map(s => s.weight)).toEqual([10, 30, 30, 30]);
  });

  it("rounding: 3 scored, no testing → 33/33/34 (totals 100)", () => {
    const rows = [
      { session_number: 1, session_type: "scrimmage", date: "2026-09-01" },
      { session_number: 2, session_type: "scrimmage", date: "2026-09-02" },
      { session_number: 3, session_type: "scrimmage", date: "2026-09-03" },
    ];
    const { sessions, total } = weightsBySession(rows);
    expect(total).toBe(100);
    expect(sessions.map(s => s.weight).sort()).toEqual([33, 33, 34]);
  });

  it("falls back to date-based grouping when there is no Session # column", () => {
    const rows = [
      { session_type: "testing", date: "2026-09-06" },
      { session_type: "scrimmage", date: "2026-09-10" },
      { session_type: "scrimmage", date: "2026-09-12" },
    ];
    const { sessions, total } = weightsBySession(rows);
    expect(total).toBe(100);
    expect(sessions.length).toBe(3); // 1 testing + 2 distinct scrim dates
  });
});
