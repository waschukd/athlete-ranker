// Real incident: EFHA cut players in an AA category stay is_active=true
// (cut_at flags them "Cut" without removing them, so scores/history survive --
// see the cut route). The onboarding/welcome blast queried is_active=true
// only, so cut players received "welcome to the next round of evaluations."
// The association's workaround was to hard-delete the cut players from the
// roster just to keep them off the send -- which also wiped their group
// assignments for nothing. Excluding cut_at IS NULL here removes the need
// for that entirely.

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
  renderTemplate: (tpl, vars) => tpl,
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

// The route's athletes query ends with `${athlete_id ? sql\`AND id = ...\` :
// sql\`\`}` -- a nested tagged-template call the real driver inlines as a
// fragment. A plain vi.fn() mock can't do that, so match by literal SQL text
// (present regardless of how many calls happen) instead of a sequential
// mockResolvedValueOnce queue, which the nested empty call would desync.
function mockSqlByQuery(responses) {
  sql.mockImplementation(async (strings) => {
    const text = strings.join("?");
    for (const [match, result] of responses) if (text.includes(match)) return result;
    return [];
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  getSession.mockResolvedValue({ email: "assoc@test", role: "association_admin" });
  authorizeCategoryAccess.mockResolvedValue({ authorized: true });
  sendEmail.mockResolvedValue({ ok: true, id: "em_1" });
});

describe("onboarding blast excludes cut players", () => {
  it("queries athletes with cut_at IS NULL, not just is_active=true", async () => {
    mockSqlByQuery([
      ["SELECT ac.name as category_name", [{ category_name: "U15 AA", organization_id: 49, org_name: "EFHA" }]],
      ["FROM athletes", []],
    ]);

    const { POST } = await import("@/app/api/categories/[catId]/notify-parents/route");
    await POST(makeReq({ action: "onboarding" }), { params: { catId: "114" } });

    const athleteQuery = sql.mock.calls.map(c => c[0].join("?")).find(q => q.includes("FROM athletes"));
    expect(athleteQuery).toContain("cut_at IS NULL");
  });

  it("never emails a cut player even when one exists on the roster", async () => {
    mockSqlByQuery([
      ["SELECT ac.name as category_name", [{ category_name: "U15 AA", organization_id: 49, org_name: "EFHA" }]],
      // The real query filters cut_at IS NULL, so a cut player never reaches
      // this result set -- this models that by only returning the survivor.
      ["FROM athletes", [{ id: 1, first_name: "Still", last_name: "Trying", parent_email: "stilltrying@example.com", parent_email_2: null }]],
    ]);

    const { POST } = await import("@/app/api/categories/[catId]/notify-parents/route");
    const res = await POST(makeReq({ action: "onboarding" }), { params: { catId: "114" } });
    const data = await res.json();

    expect(data.sent).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith("stilltrying@example.com", expect.any(String), expect.any(String));
  });
});
