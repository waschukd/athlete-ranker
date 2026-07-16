// Placement-email templating. The merge and the override→default fallback are
// the bits that fail silently (a wrong merge ships a "Hi ," to a 12-year-old),
// so they're pinned here.

import { describe, it, expect } from "vitest";
import {
  renderTemplate,
  DEFAULT_TEMPLATES,
  TEMPLATE_KEYS,
  SAMPLE_VARS,
} from "@/lib/emailTemplateDefaults";

describe("renderTemplate", () => {
  it("substitutes merge fields", () => {
    expect(renderTemplate("Hi {{player_name}}!", { player_name: "Sam" })).toBe("Hi Sam!");
  });

  it("tolerates inner whitespace", () => {
    expect(renderTemplate("{{ player_name }}", { player_name: "Sam" })).toBe("Sam");
  });

  it("blanks unknown fields rather than leaving {{raw}} in a parent's inbox", () => {
    expect(renderTemplate("Hi {{nope}}!", { player_name: "Sam" })).toBe("Hi !");
  });

  it("handles null/undefined body", () => {
    expect(renderTemplate(null, {})).toBe("");
    expect(renderTemplate(undefined, {})).toBe("");
  });

  it("does not recurse into substituted values", () => {
    // A player literally named "{{org_name}}" must not expand.
    const out = renderTemplate("{{player_name}}", { player_name: "{{org_name}}", org_name: "Acme" });
    expect(out).toBe("{{org_name}}");
  });
});

describe("player_cut default copy", () => {
  const tpl = DEFAULT_TEMPLATES.player_cut;

  it("exists and declares its merge fields", () => {
    expect(tpl).toBeTruthy();
    expect(tpl.fields).toEqual(["player_name", "org_name", "from_category", "to_category"]);
  });

  it("fully resolves — no stray merge fields survive a real render", () => {
    const vars = {
      player_name: "Sam",
      org_name: "Beaumont Amateur Hockey Association",
      from_category: "U13 AA",
      to_category: "U13 A",
    };
    const body = renderTemplate(tpl.body, vars);
    const subject = renderTemplate(tpl.subject, vars);
    expect(body).not.toMatch(/\{\{|\}\}/);
    expect(subject).not.toMatch(/\{\{|\}\}/);
    expect(body).toContain("Sam");
    expect(body).toContain("U13 A");
  });

  it("every merge field it uses is declared in fields[]", () => {
    const used = [...`${tpl.subject}\n${tpl.body}`.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(m => m[1]);
    for (const f of new Set(used)) expect(tpl.fields).toContain(f);
  });

  it("is addressed to the player, not about them", () => {
    // The brief: kids read these over a parent's shoulder.
    expect(tpl.body).toMatch(/^Hi \{\{player_name\}\}/);
  });

  it("avoids the cold wording the default is meant to replace", () => {
    const harsh = [/\bcut\b/i, /unfortunately/i, /did not make/i, /was not selected/i, /regret/i];
    for (const re of harsh) expect(tpl.body).not.toMatch(re);
  });

  it("keeps paragraph breaks, which the email renderer relies on", () => {
    expect(tpl.body.split(/\n\s*\n/).length).toBeGreaterThan(2);
  });
});

describe("template registry", () => {
  it("exposes both editable templates", () => {
    expect(TEMPLATE_KEYS).toContain("player_cut");
    expect(TEMPLATE_KEYS).toContain("welcome");
  });

  it("every template has a label, description, subject and body", () => {
    for (const k of TEMPLATE_KEYS) {
      const t = DEFAULT_TEMPLATES[k];
      expect(t.label, `${k}.label`).toBeTruthy();
      expect(t.description, `${k}.description`).toBeTruthy();
      expect(t.subject, `${k}.subject`).toBeTruthy();
      expect(t.body, `${k}.body`).toBeTruthy();
    }
  });

  it("SAMPLE_VARS covers every field of every template, so the editor preview never shows a blank", () => {
    for (const k of TEMPLATE_KEYS) {
      for (const f of DEFAULT_TEMPLATES[k].fields) {
        expect(SAMPLE_VARS[f], `SAMPLE_VARS.${f} (used by ${k})`).toBeTruthy();
      }
    }
  });
});
