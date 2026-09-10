import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// "Confirm & lock groups" set groups_locked_at and nothing else. No write path
// ever read it, so the lock was decorative: associations locked a session, came
// back, and found the groups different. auto_assign made it worse -- it silently
// set groups_locked_at = NULL while rewriting every placement, so one stray
// click both changed the roster AND destroyed the evidence that it had been
// locked at all.
//
// The gate lives on the SERVER. A client-side check alone is what let this
// happen: move_player already refused when locked in the UI, and the groups
// still changed, because every other path went straight through.

const read = (p) => readFileSync(resolve(process.cwd(), p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const API = strip(read("src/app/api/categories/[catId]/groups/route.js"));
const PAGE = strip(read("src/app/association/dashboard/category/[catId]/groups/page.jsx"));

describe("the lock is enforced server-side", () => {
  it("guards every action that moves players or recolours the session", () => {
    const m = API.match(/const GUARDED = new Set\(\[(.*?)\]\)/s);
    expect(m).toBeTruthy();
    const guarded = m[1].split(",").map(x => x.trim().replace(/["']/g, "")).filter(Boolean);
    for (const a of ["auto_assign", "move_player", "assign_player", "assign_goalie", "apply_colors"]) {
      expect(guarded, a).toContain(a);
    }
  });

  it("does not gate the deliberate way out, or single-player tweaks", () => {
    const m = API.match(/const GUARDED = new Set\(\[(.*?)\]\)/s);
    const guarded = m[1].split(",").map(x => x.trim().replace(/["']/g, "")).filter(Boolean);
    // Gating these would train people to click through the warning unread.
    for (const a of ["unlock_groups", "lock_groups", "set_color", "set_jersey_number"]) {
      expect(guarded, a).not.toContain(a);
    }
  });

  it("answers 409, not 403 -- the caller can resolve this by confirming", () => {
    expect(API).toMatch(/error: "GROUPS_LOCKED"/);
    expect(API).toMatch(/\{ status: 409 \}/);
  });

  it("only proceeds when confirm_change is explicitly sent", () => {
    expect(API).toMatch(/if \(lockedAt && !body\.confirm_change\)/);
  });

  it("resolves the session from whichever id the action carries", () => {
    // auto_assign/apply_colors send session_number, move_player sends
    // from_group_id, assign_* send group_id. Missing one silently un-guards it.
    expect(API).toMatch(/body\.session_number != null/);
    expect(API).toMatch(/body\.from_group_id/);
    expect(API).toMatch(/body\.group_id/);
  });

  it("records every override, so 'it changed on its own' has an answer", () => {
    expect(API).toMatch(/'override_locked_groups'/);
    expect(API).toMatch(/INSERT INTO audit_log/);
  });

  it("survives a database where the column was never migrated", () => {
    const block = API.slice(API.indexOf("GUARDED.has(action)"));
    expect(block.slice(0, block.indexOf("if (lockedAt"))).toMatch(/catch/);
  });
});

describe("auto_assign no longer clears the lock", () => {
  it("does not null groups_locked_at", () => {
    const block = API.slice(API.indexOf('action === "auto_assign"'), API.indexOf('action === "move_player"'));
    expect(block).not.toMatch(/groups_locked_at = NULL/);
  });

  it("unlock_groups is still the way to clear it", () => {
    const block = API.slice(API.indexOf('action === "unlock_groups"'));
    expect(block.slice(0, 300)).toMatch(/groups_locked_at = NULL/);
  });
});

describe("the client asks before overriding", () => {
  it("routes group writes through one wrapper, so a new call site cannot skip it", () => {
    expect(PAGE).toMatch(/const groupsPost = \(payload\) =>/);
    for (const a of ["auto_assign", "move_player", "assign_player", "assign_goalie"]) {
      expect(PAGE, a).toMatch(new RegExp(`groupsPost\\(\\{[^}]*action: "${a}"`));
    }
  });

  it("retries only with confirm_change after the director confirms", () => {
    expect(PAGE).toMatch(/send\(\{ confirm_change: true \}\)/);
  });

  it("uses the modal, not a same-button second click", () => {
    // A stray double-click must not be able to confirm the thing this prevents.
    expect(PAGE).toMatch(/<ConfirmDialog/);
    expect(PAGE).toMatch(/confirmLabel="Yes, change groups"/);
  });

  it("treats cancel as do-nothing at every call site", () => {
    const cancels = PAGE.match(/if \(data\.cancelled\) return;/g) || [];
    expect(cancels.length).toBeGreaterThanOrEqual(2);
  });

  it("tells them when they locked it and what the risk is", () => {
    expect(PAGE).toMatch(/lockPrompt\?\.lockedAt/);
    expect(PAGE).toMatch(/emailed parents/i);
  });
});
