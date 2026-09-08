// Real complaint: evaluators' inboxes filling up because blasting several
// back-to-back open sessions at one rink meant clicking "Blast" once per
// session -- one email per evaluator per session. schedule_ids lets an admin
// bundle a whole back-to-back block into ONE email per evaluator instead.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn(), resolveSpContext: vi.fn() }));
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ ok: true, id: "resend-1" }),
  esc: (v) => (v == null ? "" : String(v)),
  sleep: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/emailLog", () => ({
  ensureEmailLogTable: vi.fn().mockResolvedValue(undefined),
  logEmailSend: vi.fn().mockResolvedValue(undefined),
}));

import sql from "@/lib/db";
import { getSession, resolveSpContext } from "@/lib/auth";
import { sendEmail } from "@/lib/email";

process.env.RESEND_API_KEY = "test-key";

function makeReq(body) {
  return new Request("http://test/api/service-provider/notify", {
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

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ email: "admin@test", role: "service_provider_admin" });
  resolveSpContext.mockResolvedValue({ orgId: 16, isGoalie: false });
});

const SCHED_ROWS = [
  { id: 1, session_number: 1, group_number: 1, scheduled_date: "2026-09-11", start_time: "17:45:00", location: "CWB", evaluators_required: 4, organization_id: 42, service_provider_id: null, age_category_id: 90, category_name: "U15", org_name: "SEERA U15" },
  { id: 2, session_number: 1, group_number: 2, scheduled_date: "2026-09-11", start_time: "19:00:00", location: "CWB", evaluators_required: 4, organization_id: 42, service_provider_id: null, age_category_id: 90, category_name: "U15", org_name: "SEERA U15" },
];

describe("POST /api/service-provider/notify — multi-session blast", () => {
  it("sends ONE email per evaluator covering both sessions, not one per session", async () => {
    mockSqlByQuery([
      ["FROM evaluation_schedule es", SCHED_ROWS],
      ["FROM sp_association_links", [{ association_id: 42 }]],
      ["FROM evaluator_session_signups", []], // nobody signed up to either yet
      ["FROM evaluator_memberships em", [
        { email: "reed@test.com", name: "Reed" },
        { email: "sara@test.com", name: "Sara" },
      ]],
    ]);

    const { POST } = await import("@/app/api/service-provider/notify/route");
    const res = await POST(makeReq({ schedule_ids: [1, 2], message: "please help" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.sent).toBe(2);

    // 2 evaluators, ONE send call each -- not 2 evaluators x 2 sessions = 4.
    expect(sendEmail).toHaveBeenCalledTimes(2);
    const [, subject, html] = sendEmail.mock.calls[0];
    expect(subject).toContain("2 Evaluator Spots");
    expect(html).toContain("17:45");
    expect(html).toContain("19:00");
  });

  it("excludes an evaluator already signed up to every session in the block", async () => {
    mockSqlByQuery([
      ["FROM evaluation_schedule es", SCHED_ROWS],
      ["FROM sp_association_links", [{ association_id: 42 }]],
      // Reed is signed up to BOTH sessions (fully committed); Sara only one.
      ["FROM evaluator_session_signups", [
        { schedule_id: 1, user_id: 100 },
        { schedule_id: 2, user_id: 100 },
        { schedule_id: 1, user_id: 200 },
      ]],
      ["FROM evaluator_memberships em", [{ email: "sara@test.com", name: "Sara" }]],
    ]);

    const { POST } = await import("@/app/api/service-provider/notify/route");
    const res = await POST(makeReq({ schedule_ids: [1, 2] }));
    const body = await res.json();
    expect(body.success).toBe(true);
    // Only Sara's membership row was returned by the (mocked) pool query since
    // the real query excludes fully-committed users via <> ALL(...) -- this
    // just confirms the response reflects whatever the pool query returns.
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("403s the whole blast if any session in the block belongs to an unlinked org", async () => {
    mockSqlByQuery([
      ["FROM evaluation_schedule es", [
        SCHED_ROWS[0],
        { ...SCHED_ROWS[1], id: 2, organization_id: 99 }, // different, unlinked org
      ]],
      ["FROM sp_association_links", [{ association_id: 42 }]], // 99 not linked
    ]);

    const { POST } = await import("@/app/api/service-provider/notify/route");
    const res = await POST(makeReq({ schedule_ids: [1, 2] }));
    expect(res.status).toBe(403);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("still works with a single schedule_id (back-compat)", async () => {
    mockSqlByQuery([
      ["FROM evaluation_schedule es", [SCHED_ROWS[0]]],
      ["FROM sp_association_links", [{ association_id: 42 }]],
      ["FROM evaluator_session_signups", []],
      ["FROM evaluator_memberships em", [{ email: "reed@test.com", name: "Reed" }]],
    ]);

    const { POST } = await import("@/app/api/service-provider/notify/route");
    const res = await POST(makeReq({ schedule_id: 1 }));
    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [, subject] = sendEmail.mock.calls[0];
    expect(subject).not.toContain("Spots Open"); // singular-session subject line
  });
});
