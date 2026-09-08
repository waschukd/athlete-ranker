// Real incident: Sara Diamond signed up for two sessions that did NOT overlap
// at signup time. One of them was moved later (a schedule edit), and nothing
// ever re-checked her existing signups against the new time -- she ended up
// double-booked at two different rinks with no warning to her or anyone else.
// The signup route's own conflict guard only runs at signup time; this covers
// the other half: a session that moves AFTER people are already on it.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/email", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    sendEmail: vi.fn().mockResolvedValue({ ok: true }),
    emailWrapper: (html) => html,
    esc: (v) => String(v ?? ""),
  };
});

import sql from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { warnScheduleConflicts } from "@/lib/scheduleNotify";

const EDITED_ROW = {
  id: 450, scheduled_date: "2026-09-14", start_time: "18:00", end_time: "19:00",
  location: "MWB", session_number: 2, group_number: 1,
};

beforeEach(() => { vi.clearAllMocks(); });

describe("warnScheduleConflicts", () => {
  it("skips when the edited row has no complete time", async () => {
    const r = await warnScheduleConflicts({ catId: 1, scheduleRow: { ...EDITED_ROW, end_time: null } });
    expect(r).toEqual({ warned: 0, skipped: "missing_time" });
    expect(sql).not.toHaveBeenCalled();
  });

  it("does nothing when nobody on this session now conflicts with anything else", async () => {
    sql.mockResolvedValueOnce([{ category_name: "U15", org_id: 42, org_name: "SEERA U15" }]); // catInfo
    sql.mockResolvedValueOnce([]); // conflicts -- none
    const r = await warnScheduleConflicts({ catId: 1, scheduleRow: EDITED_ROW });
    expect(r).toEqual({ warned: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("emails the double-booked evaluator AND the org's admins", async () => {
    sql.mockResolvedValueOnce([{ category_name: "U15", org_id: 42, org_name: "SEERA U15" }]); // catInfo
    sql.mockResolvedValueOnce([{
      user_id: 143, email: "sara@test.com", name: "Sara Diamond",
      other_schedule_id: 281, other_start: "17:30", other_end: "18:30", other_location: "Sherwood Park Shell",
      other_session: 2, other_group: 1, other_category: "U11", other_org: "SPS Fuzion",
    }]); // conflicts
    sql.mockResolvedValueOnce([{ sp_email: "sp@test.com", sp_name: "SPS Fuzion" }]); // sps
    sql.mockResolvedValueOnce([{ email: "assoc@test.com", name: "Assoc Admin" }]); // getOrgRoleUsers

    const r = await warnScheduleConflicts({ catId: 1, scheduleRow: EDITED_ROW });
    expect(r).toEqual({ warned: 1 });

    // Evaluator gets one email naming both sessions.
    expect(sendEmail).toHaveBeenCalledWith(
      "sara@test.com",
      expect.stringContaining("double-booked"),
      expect.stringContaining("Sherwood Park Shell"),
    );
    // Each admin (SP + association) gets an alert naming the evaluator.
    expect(sendEmail).toHaveBeenCalledWith("sp@test.com", expect.stringContaining("Sara Diamond"), expect.any(String));
    expect(sendEmail).toHaveBeenCalledWith("assoc@test.com", expect.stringContaining("Sara Diamond"), expect.any(String));
    expect(sendEmail).toHaveBeenCalledTimes(3);
  });

  it("checks against status = 'signed_up', not != 'cancelled'", async () => {
    sql.mockResolvedValueOnce([{ category_name: "U15", org_id: 42, org_name: "SEERA U15" }]);
    sql.mockResolvedValueOnce([]);
    await warnScheduleConflicts({ catId: 1, scheduleRow: EDITED_ROW });
    const conflictQuery = sql.mock.calls[1][0].join("?");
    expect(conflictQuery).toMatch(/status = 'signed_up'/);
  });
});
