// Real complaint: a session added earlier in the day at the same rink than
// one an evaluator already signed up for was invisible to them unless they
// happened to reopen their dashboard. notifyConnectingEvaluators targets
// specifically the evaluators already committed to a same-day, same-rink
// session that now connects to the new/moved one (same block detection as
// lib/sessionBlocks.contiguousBlock), rather than the whole eligible pool.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/email", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual, // real fmtBlastDate/fmtBlastTime -- verifies the actual formatting, not a stand-in
    sendEmail: vi.fn().mockResolvedValue({ ok: true }),
    emailWrapper: (html) => html,
    parentEmails: (a) => [a.parent_email, a.parent_email_2].filter(Boolean),
    esc: (v) => String(v ?? ""),
  };
});

import sql from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { notifyConnectingEvaluators } from "@/lib/scheduleNotify";

const NEW_ROW = {
  id: 500, status: "scheduled", evaluators_required: 4,
  scheduled_date: "2026-09-10", start_time: "19:00", end_time: "20:00", location: "Rink A",
};

beforeEach(() => { vi.clearAllMocks(); });

describe("notifyConnectingEvaluators", () => {
  it("skips when the new session needs no evaluators", async () => {
    const r = await notifyConnectingEvaluators({ catId: 1, scheduleRow: { ...NEW_ROW, evaluators_required: 0 } });
    expect(r).toEqual({ notified: 0, skipped: "no_evaluators_needed" });
    expect(sql).not.toHaveBeenCalled();
  });

  it("skips when there's no scheduled time/location yet", async () => {
    const r = await notifyConnectingEvaluators({ catId: 1, scheduleRow: { ...NEW_ROW, location: null } });
    expect(r).toEqual({ notified: 0, skipped: "missing_time_or_location" });
    expect(sql).not.toHaveBeenCalled();
  });

  it("skips when nothing else is scheduled that day at that rink", async () => {
    sql.mockResolvedValueOnce([{ category_name: "U11 House", org_id: 42, org_name: "BAHA" }]); // catInfo
    sql.mockResolvedValueOnce([]); // dayRows -- nothing else that day
    const r = await notifyConnectingEvaluators({ catId: 1, scheduleRow: NEW_ROW });
    expect(r).toEqual({ notified: 0, skipped: "no_connections" });
  });

  it("finds evaluators signed up to a connecting same-rink session and emails just them", async () => {
    sql.mockResolvedValueOnce([{ category_name: "U11 House", org_id: 42, org_name: "BAHA" }]); // catInfo
    sql.mockResolvedValueOnce([
      // Ends 18:45, new row starts 19:00 -- 15 min gap, within the 30-min threshold. Same rink.
      { schedule_id: 100, scheduled_date: "2026-09-10", start_time: "17:30", end_time: "18:45", location: "Rink A" },
      // Different rink -- must not connect.
      { schedule_id: 200, scheduled_date: "2026-09-10", start_time: "18:30", end_time: "19:30", location: "Rink B" },
    ]); // dayRows
    sql.mockResolvedValueOnce([{ n: 0 }]); // signup count on the new row -- fully open
    sql.mockResolvedValueOnce([{ id: 1, email: "reed@test.com", name: "Reed" }]); // evaluators on the connecting session

    const r = await notifyConnectingEvaluators({ catId: 1, scheduleRow: NEW_ROW });
    expect(r).toEqual({ notified: 1 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith("reed@test.com", expect.stringContaining("connecting session"), expect.any(String));

    // The evaluators query is scoped to the connecting session (100), not the
    // unrelated other-rink one (200).
    const evalQueryText = sql.mock.calls[3][0].join("?");
    expect(evalQueryText).toContain("evaluator_session_signups");
  });

  it("skips once the new session is already fully staffed", async () => {
    sql.mockResolvedValueOnce([{ category_name: "U11 House", org_id: 42, org_name: "BAHA" }]);
    sql.mockResolvedValueOnce([{ schedule_id: 100, scheduled_date: "2026-09-10", start_time: "17:30", end_time: "18:45", location: "Rink A" }]);
    sql.mockResolvedValueOnce([{ n: 4 }]); // already fully staffed (required = 4)

    const r = await notifyConnectingEvaluators({ catId: 1, scheduleRow: NEW_ROW });
    expect(r).toEqual({ notified: 0, skipped: "already_full" });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("returns 0 when nobody is signed up to the connecting session", async () => {
    sql.mockResolvedValueOnce([{ category_name: "U11 House", org_id: 42, org_name: "BAHA" }]);
    sql.mockResolvedValueOnce([{ schedule_id: 100, scheduled_date: "2026-09-10", start_time: "17:30", end_time: "18:45", location: "Rink A" }]);
    sql.mockResolvedValueOnce([{ n: 0 }]);
    sql.mockResolvedValueOnce([]); // nobody signed up to schedule 100

    const r = await notifyConnectingEvaluators({ catId: 1, scheduleRow: NEW_ROW });
    expect(r).toEqual({ notified: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
