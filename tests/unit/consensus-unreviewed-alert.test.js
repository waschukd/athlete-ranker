// Real bug: closing a session with unreviewed low-agreement flags queried
// `users.organization_id`, a column that has never existed in this schema --
// every other org-membership lookup in this codebase goes through
// evaluator_memberships. The query threw, and since it sat inside the outer
// try/catch that returns the whole response, the evaluator got a 500 back
// even though the close itself (evaluator_session_signups.completed = true)
// had already committed just above it.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/authorize", () => ({ authorizeCategoryAccess: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue({ ok: true, id: "resend-1" }), esc: (s) => s }));
vi.mock("@/lib/emailLog", () => ({
  ensureEmailLogTable: vi.fn().mockResolvedValue(undefined),
  logEmailSend: vi.fn().mockResolvedValue(undefined),
}));

import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { sendEmail } from "@/lib/email";

function makeReq(body) {
  return new Request("http://test/api/categories/113/consensus", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ email: "director@test", role: "director" });
  authorizeCategoryAccess.mockResolvedValue({ authorized: true });
});

describe("POST /api/categories/[catId]/consensus — close_session with unreviewed flags", () => {
  it("does not query the nonexistent users.organization_id column", async () => {
    let sawBadColumn = false;
    sql.mockImplementation(async (strings) => {
      const text = strings.join("?");
      if (text.includes("u.organization_id")) sawBadColumn = true;
      if (text.includes("FROM evaluation_schedule WHERE id")) return [{ id: 656 }]; // schedOwned guard
      if (text.includes("FROM evaluation_schedule es") && text.includes("total_checked_in")) return []; // skip integrity checks
      if (text.includes("SELECT es.*")) return [{ id: 656, org_id: 49, category_name: "U13 AA", group_number: 1, scheduled_date: "2026-09-13" }];
      if (text.includes("FROM evaluator_memberships em") && text.includes("sp_association_links")) {
        return [{ email: "spadmin@test.com", name: "SP Admin" }];
      }
      return [];
    });

    const { POST } = await import("@/app/api/categories/[catId]/consensus/route");
    const res = await POST(makeReq({
      action: "close_session", schedule_id: 656, session_number: 1,
      unreviewed_flags: [{ first_name: "Alex", last_name: "Athlete", overall_agreement: 60 }],
    }), { params: { catId: "113" } });

    expect(sawBadColumn).toBe(false);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(sendEmail).toHaveBeenCalledWith("spadmin@test.com", expect.stringContaining("Consensus Skipped"), expect.any(String));
  });

  it("resolves SP admins through evaluator_memberships, scoped to the association's own SP link", async () => {
    sql.mockImplementation(async (strings) => {
      const text = strings.join("?");
      if (text.includes("FROM evaluation_schedule WHERE id")) return [{ id: 656 }];
      if (text.includes("FROM evaluation_schedule es") && text.includes("total_checked_in")) return [];
      if (text.includes("SELECT es.*")) return [{ id: 656, org_id: 49, category_name: "U13 AA", group_number: 1, scheduled_date: "2026-09-13" }];
      return [];
    });

    const { POST } = await import("@/app/api/categories/[catId]/consensus/route");
    await POST(makeReq({
      action: "close_session", schedule_id: 656, session_number: 1,
      unreviewed_flags: [{ first_name: "Alex", last_name: "Athlete", overall_agreement: 60 }],
    }), { params: { catId: "113" } });

    const call = sql.mock.calls.find(c => c[0].join("?").includes("evaluator_memberships em") && c[0].join("?").includes("sp_association_links"));
    expect(call).toBeTruthy();
    const [strings, orgIdArg] = call;
    const text = strings.join("?");
    expect(text).toMatch(/association_id = \?/);
    expect(text).toMatch(/UNION SELECT \?/);
    expect(orgIdArg).toBe(49);
  });
});
