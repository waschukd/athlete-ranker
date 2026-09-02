// Real incident: a registrar replied to an invite email; the reply bounced
// because FROM (updates@sidelinestar.com) has no real inbox behind it. Every
// transactional email site-wide goes through this one sendEmail() function
// (confirmed -- it's the only file in src that calls api.resend.com), so a
// Reply-To fixes it everywhere at once.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("sendEmail sets a real Reply-To", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.RESEND_API_KEY = "test-key";
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "em_1" }) });
  });
  afterEach(() => { delete global.fetch; delete process.env.EMAIL_REPLY_TO; });

  it("defaults Reply-To to dan@competitivethread.com", async () => {
    const { sendEmail, REPLY_TO } = await import("@/lib/email");
    expect(REPLY_TO).toBe("dan@competitivethread.com");

    await sendEmail("someone@example.com", "Subject", "<p>body</p>");

    const [, opts] = global.fetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.reply_to).toBe("dan@competitivethread.com");
  });

  it("respects an EMAIL_REPLY_TO override", async () => {
    process.env.EMAIL_REPLY_TO = "support@sidelinestar.com";
    const { sendEmail } = await import("@/lib/email");

    await sendEmail("someone@example.com", "Subject", "<p>body</p>");

    const [, opts] = global.fetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.reply_to).toBe("support@sidelinestar.com");
  });
});
