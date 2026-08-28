import { describe, it, expect, vi, beforeEach } from "vitest";

// notifyParentsIfImminent gates a parent notice by "is this imminent" (<=48h
// out) OR "were parents already told a now-wrong time" (the per-session ice
// time email logs to group_email_log). A far-out edit used to never notify a
// family who'd already been emailed the old time.
vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ ok: true }),
  emailWrapper: (html) => html,
  parentEmails: (a) => [a.parent_email, a.parent_email_2].filter(Boolean),
  esc: (v) => String(v ?? ""),
}));

import sql from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { notifyParentsIfImminent } from "@/lib/scheduleNotify";

const FAR_FUTURE = new Date(Date.now() + 10 * 24 * 3_600_000).toISOString();
const IMMINENT = new Date(Date.now() + 6 * 3_600_000).toISOString();
const FAR_PAST = new Date(Date.now() - 10 * 24 * 3_600_000).toISOString();

describe("notifyParentsIfImminent", () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it("skips a far-future edit when parents were never told a time", async () => {
    sql.mockResolvedValueOnce([]); // group_email_log: nothing sent yet
    const r = await notifyParentsIfImminent({
      catId: 1, changeType: "edited",
      scheduleRow: { scheduled_date: FAR_FUTURE, session_number: 2, group_number: 1 },
    });
    expect(r).toEqual({ notified: 0, skipped: "not_imminent" });
    expect(sql).toHaveBeenCalledTimes(1); // only the group_email_log check — never queried parents
  });

  it("notifies for a far-future edit when parents already got the ice-time email", async () => {
    sql.mockResolvedValueOnce([{ 1: 1 }]); // group_email_log: already sent
    sql.mockResolvedValueOnce([{ id: 5, parent_email: "mom@example.com", parent_email_2: null, first_name: "Alex", last_name: "Athlete" }]);
    sql.mockResolvedValueOnce([{ category_name: "U11 House", org_name: "Demo Soci" }]);
    const r = await notifyParentsIfImminent({
      catId: 1, changeType: "edited",
      scheduleRow: { scheduled_date: FAR_FUTURE, session_number: 2, group_number: 1, start_time: "18:00" },
    });
    expect(r).toEqual({ notified: 1 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith("mom@example.com", expect.stringContaining("Session time changed"), expect.any(String));
  });

  it("still notifies immediately when the change is genuinely imminent, told or not", async () => {
    sql.mockResolvedValueOnce([]); // group_email_log: nothing sent
    sql.mockResolvedValueOnce([{ id: 5, parent_email: "mom@example.com", parent_email_2: null, first_name: "Alex", last_name: "Athlete" }]);
    sql.mockResolvedValueOnce([{ category_name: "U11 House", org_name: "Demo Soci" }]);
    const r = await notifyParentsIfImminent({
      catId: 1, changeType: "cancelled",
      scheduleRow: { scheduled_date: IMMINENT, session_number: 1, group_number: 1 },
    });
    expect(r).toEqual({ notified: 1 });
  });

  it("never notifies about a session more than ~24h in the past, even if parents were told", async () => {
    const r = await notifyParentsIfImminent({
      catId: 1, changeType: "cancelled",
      scheduleRow: { scheduled_date: FAR_PAST, session_number: 1, group_number: 1 },
    });
    expect(r).toEqual({ notified: 0, skipped: "already_past" });
    expect(sql).not.toHaveBeenCalled();
  });

  it("falls back to imminent-only when the schedule row has no group_number", async () => {
    const r = await notifyParentsIfImminent({
      catId: 1, changeType: "edited",
      scheduleRow: { scheduled_date: FAR_FUTURE, session_number: 2, group_number: null },
    });
    expect(r).toEqual({ notified: 0, skipped: "not_imminent" });
    expect(sql).not.toHaveBeenCalled(); // can't check group_email_log without a group
  });
});
