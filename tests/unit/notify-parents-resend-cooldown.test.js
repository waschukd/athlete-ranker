// Real incident: a single-family "resend welcome" had no guard against firing
// repeatedly -- the button gave no feedback either way (see the frontend fix
// in CategoryDashboard.jsx), so a director unsure whether their click worked
// kept clicking it. One family got the welcome email 8 times in five minutes,
// each one a real send to both parents. A resend for one athlete now checks
// when the last welcome went out to them and refuses (429) inside a 5-minute
// cooldown instead of silently re-sending; a genuine resend later still works.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/authorize", () => ({ authorizeCategoryAccess: vi.fn() }));
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ ok: true, id: "em_1" }),
  emailWrapper: (html) => html,
  parentOnboardingHtml: () => "<p>welcome</p>",
  parentEmails: (a) => [a.parent_email, a.parent_email_2].filter(Boolean),
  esc: (v) => String(v ?? ""),
}));
vi.mock("@/lib/emailTemplates", () => ({
  getEmailTemplate: vi.fn().mockResolvedValue(null),
  renderTemplate: (tpl) => tpl,
}));
vi.mock("@/lib/emailLog", () => ({
  ensureEmailLogTable: vi.fn().mockResolvedValue(),
  logEmailSend: vi.fn().mockResolvedValue(),
}));

import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { sendEmail } from "@/lib/email";

function makeReq(body) {
  return new Request("http://test/api/categories/114/notify-parents", {
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

const ATHLETE = { id: 2786, first_name: "Abigail", last_name: "Broemeling", parent_email: "candace@example.com", parent_email_2: "al@example.com" };

beforeEach(() => {
  vi.resetAllMocks();
  getSession.mockResolvedValue({ email: "assoc@test", role: "association_admin" });
  authorizeCategoryAccess.mockResolvedValue({ authorized: true });
  sendEmail.mockResolvedValue({ ok: true, id: "em_1" });
});

describe("single-family welcome resend cooldown", () => {
  it("refuses a resend sent 2 minutes after the last one", async () => {
    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    mockSqlByQuery([
      ["SELECT ac.name as category_name", [{ category_name: "U11 Community", organization_id: 49, org_name: "EFHA" }]],
      ["FROM athletes", [ATHLETE]],
      ["MAX(created_at)", [{ last_sent: twoMinAgo }]],
    ]);

    const { POST } = await import("@/app/api/categories/[catId]/notify-parents/route");
    const res = await POST(makeReq({ action: "onboarding", athlete_id: 2786 }), { params: { catId: "114" } });

    expect(res.status).toBe(429);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("allows a resend when the last one was over 5 minutes ago", async () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    mockSqlByQuery([
      ["SELECT ac.name as category_name", [{ category_name: "U11 Community", organization_id: 49, org_name: "EFHA" }]],
      ["FROM athletes", [ATHLETE]],
      ["MAX(created_at)", [{ last_sent: tenMinAgo }]],
    ]);

    const { POST } = await import("@/app/api/categories/[catId]/notify-parents/route");
    const res = await POST(makeReq({ action: "onboarding", athlete_id: 2786 }), { params: { catId: "114" } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.sent).toBe(2);
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it("allows the very first welcome send (no prior send on record)", async () => {
    mockSqlByQuery([
      ["SELECT ac.name as category_name", [{ category_name: "U11 Community", organization_id: 49, org_name: "EFHA" }]],
      ["FROM athletes", [ATHLETE]],
      ["MAX(created_at)", [{ last_sent: null }]],
    ]);

    const { POST } = await import("@/app/api/categories/[catId]/notify-parents/route");
    const res = await POST(makeReq({ action: "onboarding", athlete_id: 2786 }), { params: { catId: "114" } });

    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it("does not apply the cooldown to a full category-wide blast (no athlete_id)", async () => {
    const secondsAgo = new Date(Date.now() - 5000).toISOString();
    mockSqlByQuery([
      ["SELECT ac.name as category_name", [{ category_name: "U11 Community", organization_id: 49, org_name: "EFHA" }]],
      ["FROM athletes", [ATHLETE]],
      ["MAX(created_at)", [{ last_sent: secondsAgo }]],
    ]);

    const { POST } = await import("@/app/api/categories/[catId]/notify-parents/route");
    const res = await POST(makeReq({ action: "onboarding" }), { params: { catId: "114" } });

    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });
});
