import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// An EFHA director opening Raw Testing Scores was redirected to the sign-in
// page while holding a perfectly valid token, because the middleware's director
// carve-out listed only groups and flags. Two separate faults made it land as
// "it keeps logging me out":
//
//   1. testing was not in the allow-list, so the page was refused at all.
//   2. a signed-in user refused by ROLE was sent to /account/signin, which is
//      indistinguishable from an expired session -- so they signed back in and
//      hit the identical wall, every time.
//
// The API side was never the problem: authorizeCategoryAccess already grants a
// director access to a category they are assigned to.

const SRC = readFileSync(resolve(process.cwd(), "src/middleware.js"), "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// Pull the real regex out of the file so the test exercises what actually ships.
const allowMatch = CODE.match(/const DIRECTOR_ASSOC_ALLOW = (\/.*\/);/);
const DIRECTOR_ALLOW = new RegExp(allowMatch[1].slice(1, -1));

describe("a director can reach the pages they are meant to use", () => {
  it("allows raw testing scores -- the page that was reported broken", () => {
    expect(DIRECTOR_ALLOW.test("/association/dashboard/category/95/testing")).toBe(true);
  });

  it("still allows groups and flags", () => {
    expect(DIRECTOR_ALLOW.test("/association/dashboard/category/95/groups")).toBe(true);
    expect(DIRECTOR_ALLOW.test("/association/dashboard/category/113/flags")).toBe(true);
  });

  it("works with a query string and a trailing segment", () => {
    expect(DIRECTOR_ALLOW.test("/association/dashboard/category/95/testing/")).toBe(true);
  });

  it("does NOT hand a director the rest of the association dashboard", () => {
    // The carve-out is deliberately narrow: these are admin surfaces.
    for (const p of [
      "/association/dashboard",
      "/association/dashboard/category/95",
      "/association/dashboard/category/95/setup",
      "/association/dashboard/category/95/teams",
    ]) {
      expect(DIRECTOR_ALLOW.test(p), p).toBe(false);
    }
  });

  it("does not match a path that merely contains the word", () => {
    expect(DIRECTOR_ALLOW.test("/association/dashboard/category/95/testing-upload")).toBe(false);
  });
});

describe("a signed-in user is never bounced to the sign-in screen", () => {
  it("sends a refused user to their own dashboard instead", () => {
    expect(CODE).toMatch(/const home = homeForRole\(payload\.role\)/);
    expect(CODE).toMatch(/return NextResponse\.redirect\(new URL\(home, request\.url\)\)/);
  });

  it("guards against a redirect loop when their own home is what was refused", () => {
    expect(CODE).toMatch(/if \(!pathname\.startsWith\(home\)\)/);
  });

  it("maps every role to a landing path, matching lib/auth.js", () => {
    const roles = ["super_admin", "service_provider_admin", "goalie_service_provider_admin",
      "association_admin", "director", "service_provider_tester", "volunteer"];
    for (const r of roles) expect(CODE).toMatch(new RegExp(`case "${r}":`));
    expect(CODE).toMatch(/default: return "\/evaluator\/dashboard"/);
  });

  it("still answers an API call with a status code, not a redirect", () => {
    // A fetch that follows a redirect to an HTML sign-in page is what turns an
    // auth problem into "no internet connection" in the UI.
    expect(CODE).toMatch(/if \(pathname\.startsWith\("\/api\/"\)\) \{\s*return NextResponse\.json\(\{ error: "Forbidden" \}, \{ status: 403 \}\)/);
  });
});
