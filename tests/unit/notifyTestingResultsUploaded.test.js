import { describe, it, expect, vi, beforeEach } from "vitest";

// Directors/admins have no other signal that testing results exist until they
// happen to open the dashboard, since testing is a one-shot CSV upload rather
// than a live session. This should fire once per successful upload.
vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ ok: true }),
  emailWrapper: (html) => html,
  parentEmails: (a) => [a.parent_email, a.parent_email_2].filter(Boolean),
  esc: (v) => String(v ?? ""),
}));

import sql from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { notifyTestingResultsUploaded } from "@/lib/scheduleNotify";

describe("notifyTestingResultsUploaded", () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it("skips entirely when nothing matched (no real upload happened)", async () => {
    const r = await notifyTestingResultsUploaded({ catId: 43, sessionNumber: 1, matchedCount: 0 });
    expect(r).toEqual({ notified: 0, skipped: "no_matches" });
    expect(sql).not.toHaveBeenCalled();
  });

  it("emails the category's directors and the association's admins", async () => {
    sql
      .mockResolvedValueOnce([{ category_name: "U11 Jr Kings", org_id: 9, org_name: "SPS Fuzion", org_email: "contact@fuzion.com" }])
      .mockResolvedValueOnce([{ email: "admin@fuzion.com", name: "Fuzion Admin" }])
      .mockResolvedValueOnce([{ email: "director@fuzion.com", name: "Fuzion Director" }]);

    const r = await notifyTestingResultsUploaded({ catId: 43, sessionNumber: 1, matchedCount: 19 });

    expect(r).toEqual({ notified: 3 });
    const recipients = sendEmail.mock.calls.map(c => c[0]);
    expect(recipients).toEqual(expect.arrayContaining(["contact@fuzion.com", "admin@fuzion.com", "director@fuzion.com"]));
    expect(sendEmail).toHaveBeenCalledWith(expect.any(String), "Testing results uploaded — U11 Jr Kings", expect.stringContaining("Session 1"));
  });

  it("dedupes when the org contact is also listed as an admin", async () => {
    sql
      .mockResolvedValueOnce([{ category_name: "U9 Tier 1", org_id: 5, org_name: "Millwoods", org_email: "same@millwoods.com" }])
      .mockResolvedValueOnce([{ email: "same@millwoods.com", name: "Same Person" }])
      .mockResolvedValueOnce([]);

    const r = await notifyTestingResultsUploaded({ catId: 92, sessionNumber: 1, matchedCount: 28 });
    expect(r).toEqual({ notified: 1 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("no-ops quietly when the category doesn't exist", async () => {
    sql.mockResolvedValueOnce([]);
    const r = await notifyTestingResultsUploaded({ catId: 999, sessionNumber: 1, matchedCount: 5 });
    expect(r).toEqual({ notified: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
