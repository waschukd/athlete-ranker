// Real incident: Sara Diamond signed up for two sessions that did NOT overlap
// at signup time. One of them was moved later (a schedule edit), and nothing
// ever re-checked her existing signups against the new time -- she ended up
// double-booked at two different rinks with no warning to her or anyone else.
// The signup routes' own conflict guards only run at signup time; this covers
// the other half: a session that moves AFTER people are already on it --
// evaluator/evaluator, tester/tester, AND the cross case (a tester's testing
// slot moving onto an evaluation they already signed up for, or vice versa).
// Also covers an SP-owned testing event (no age_category_id, no association
// to derive context from -- only a service_provider_id).
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
  id: 450, age_category_id: 90, scheduled_date: "2026-09-14", start_time: "18:00", end_time: "19:00",
  location: "MWB", session_number: 2, group_number: 1,
};

beforeEach(() => { vi.clearAllMocks(); });

describe("warnScheduleConflicts", () => {
  it("skips when the edited row has no complete time", async () => {
    const r = await warnScheduleConflicts({ scheduleRow: { ...EDITED_ROW, end_time: null } });
    expect(r).toEqual({ warned: 0, skipped: "missing_time" });
    expect(sql).not.toHaveBeenCalled();
  });

  it("skips a row with neither a category nor a service provider to derive context from", async () => {
    const r = await warnScheduleConflicts({ scheduleRow: { ...EDITED_ROW, age_category_id: null } });
    expect(r).toEqual({ warned: 0, skipped: "no_org_context" });
    expect(sql).not.toHaveBeenCalled();
  });

  it("does nothing when nobody on this session now conflicts with anything else", async () => {
    sql.mockResolvedValueOnce([{ category_name: "U15", org_id: 42, org_name: "SEERA U15" }]); // catInfo
    sql.mockResolvedValueOnce([]); // conflicts -- none
    const r = await warnScheduleConflicts({ scheduleRow: EDITED_ROW });
    expect(r).toEqual({ warned: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("checks BOTH evaluator_session_signups and tester_session_signups for who's on this row and what else they have", async () => {
    sql.mockResolvedValueOnce([{ category_name: "U15", org_id: 42, org_name: "SEERA U15" }]);
    sql.mockResolvedValueOnce([]);
    await warnScheduleConflicts({ scheduleRow: EDITED_ROW });
    const conflictQuery = sql.mock.calls[1][0].join("?");
    expect(conflictQuery).toContain("evaluator_session_signups");
    expect(conflictQuery).toContain("tester_session_signups");
    expect(conflictQuery).toMatch(/status = 'signed_up'/);
  });

  it("emails the double-booked person AND the org's admins (evaluator/evaluator case)", async () => {
    sql.mockResolvedValueOnce([{ category_name: "U15", org_id: 42, org_name: "SEERA U15" }]); // catInfo
    sql.mockResolvedValueOnce([{
      user_id: 143, email: "sara@test.com", name: "Sara Diamond", other_role: "evaluator",
      other_schedule_id: 281, other_start: "17:30", other_end: "18:30", other_location: "Sherwood Park Shell",
      other_session: 2, other_group: 1, other_category: "U11", other_org: "SPS Fuzion",
    }]); // conflicts
    sql.mockResolvedValueOnce([{ sp_email: "sp@test.com", sp_name: "SPS Fuzion" }]); // sps
    sql.mockResolvedValueOnce([{ email: "assoc@test.com", name: "Assoc Admin" }]); // getOrgRoleUsers

    const r = await warnScheduleConflicts({ scheduleRow: EDITED_ROW });
    expect(r).toEqual({ warned: 1 });

    expect(sendEmail).toHaveBeenCalledWith(
      "sara@test.com",
      expect.stringContaining("double-booked"),
      expect.stringContaining("Sherwood Park Shell"),
    );
    expect(sendEmail).toHaveBeenCalledWith("sp@test.com", expect.stringContaining("Sara Diamond"), expect.any(String));
    expect(sendEmail).toHaveBeenCalledWith("assoc@test.com", expect.stringContaining("Sara Diamond"), expect.any(String));
    expect(sendEmail).toHaveBeenCalledTimes(3);
  });

  it("handles the cross case -- a tester's slot now overlaps an evaluation they signed up for", async () => {
    sql.mockResolvedValueOnce([{ category_name: "U13 House", org_id: 42, org_name: "SPS Fuzion" }]); // catInfo for the (testing) row being edited
    sql.mockResolvedValueOnce([{
      user_id: 25, email: "dan@competitivethread.com", name: "Dan Competitive Thread", other_role: "evaluator",
      other_schedule_id: 285, other_start: "17:30", other_end: "18:30", other_location: "Sherwood Park Shell",
      other_session: 4, other_group: 1, other_category: "U11", other_org: "SPS Fuzion",
    }]);
    sql.mockResolvedValueOnce([]); // sps
    sql.mockResolvedValueOnce([]); // getOrgRoleUsers

    const r = await warnScheduleConflicts({ scheduleRow: { ...EDITED_ROW, id: 526, start_time: "17:45", end_time: "18:45" } });
    expect(r).toEqual({ warned: 1 });
    expect(sendEmail).toHaveBeenCalledWith("dan@competitivethread.com", expect.any(String), expect.stringContaining("Sherwood Park Shell"));
  });

  it("an SP-owned testing event (no category) derives context from service_provider_id and alerts only the SP's own admins", async () => {
    const SP_ROW = { id: 526, service_provider_id: 16, client_label: "U13 House", scheduled_date: "2026-09-19", start_time: "17:45", end_time: "18:45", location: "TMW" };
    sql.mockResolvedValueOnce([{ org_id: 16, org_name: "Competitive Thread" }]); // spInfo (organizations, not age_categories)
    sql.mockResolvedValueOnce([{
      user_id: 25, email: "dan@competitivethread.com", name: "Dan", other_role: "evaluator",
      other_schedule_id: 285, other_start: "17:30", other_end: "18:30", other_location: "Sherwood Park Shell",
      other_session: 4, other_group: 1, other_category: "U11", other_org: "SPS Fuzion",
    }]); // conflicts
    // No sps query for an SP-owned event -- it IS the SP, nothing to link to.
    sql.mockResolvedValueOnce([{ email: "admin@sptest.com", name: "SP Admin" }]); // getOrgRoleUsers(16)

    const r = await warnScheduleConflicts({ scheduleRow: SP_ROW });
    expect(r).toEqual({ warned: 1 });
    expect(sql).toHaveBeenCalledTimes(3); // spInfo, conflicts, getOrgRoleUsers -- no sp_association_links lookup
    expect(sendEmail).toHaveBeenCalledWith("dan@competitivethread.com", expect.any(String), expect.any(String));
    expect(sendEmail).toHaveBeenCalledWith("admin@sptest.com", expect.any(String), expect.any(String));
  });
});
