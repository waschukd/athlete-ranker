import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET environment variable is required");
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET);

const PUBLIC_PATHS = [
  "/landing",
  "/privacy",
  "/account/signin",
  "/account/signup",
  "/account/forgot-password",
  "/account/reset-password",
  "/checkin",
  "/evaluator/signup",
  "/accept-invite",
  // Directors set their password from an emailed link, exactly like org admins
  // -- but their page lives under /director, which is NOT covered by the
  // "/accept-invite" prefix above. Without these two entries the invite link
  // bounces to /account/signin, where the director has no account yet.
  "/director/accept-invite",
  "/api/director/accept-invite",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/auth/signup-request",
  "/api/checkin",
  "/api/evaluator/register",
  "/api/evaluator/signup",
  "/api/evaluator/join",
  "/api/admin/accept-invite",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  // Calendar apps (Google, Apple, Outlook) fetch the .ics feed without a
  // session cookie. The route self-auths via HMAC token in the query string.
  "/api/evaluator/calendar",
  "/api/service-provider/calendar",
  "/api/tester/calendar",
  "/api/association/calendar",
  // Parent "Add to calendar · Apple/Outlook" link. Parents have no account, so
  // this must be reachable without a cookie; it self-auths via HMAC token.
  "/api/calendar/session.ics",
  "/report",
  "/api/report",
  // Coaches have no account -- they reach their team report via an emailed,
  // HMAC-signed token link (see teams/route.js email_coach_reports). The route
  // itself validates the token; this just lets the request past the cookie gate.
  "/coach-report",
  "/api/coach-report",
  "/prototype",
  "/api/payments",
  "/api/webhooks",
  // Vercel's cron scheduler calls this with no session cookie -- it
  // self-auths via the CRON_SECRET bearer token checked in the route itself,
  // same pattern as the HMAC-token routes above. Without this entry the
  // cookie gate 401'd every cron invocation before the route ever ran its
  // own auth check, so weekly_report/daily_alert/session_reminder/auto_close
  // never fired even once.
  "/api/cron",
  "/_next",
  "/favicon",
];

const ROLE_ROUTES = {
  "/admin/god-mode": ["super_admin"],
  "/service-provider": ["service_provider_admin", "goalie_service_provider_admin", "super_admin"],
  "/goalie-provider": ["goalie_service_provider_admin", "super_admin"],
  "/association/dashboard": ["association_admin", "super_admin", "service_provider_admin", "goalie_service_provider_admin"],
  "/association": ["association_admin", "super_admin", "service_provider_admin", "goalie_service_provider_admin"],
  "/player": ["association_admin", "super_admin", "service_provider_admin", "goalie_service_provider_admin", "director", "association_evaluator", "service_provider_evaluator"],
  "/director/dashboard": ["director", "association_admin", "super_admin"],
  "/tester": ["service_provider_tester", "service_provider_admin", "goalie_service_provider_admin", "super_admin"],
  "/evaluator": ["association_evaluator", "service_provider_evaluator", "service_provider_tester", "super_admin", "association_admin", "service_provider_admin", "goalie_service_provider_admin", "director"],
};

// Directors are not association admins, but an assigned director may use the
// group-building, flags and raw-testing sub-pages (the APIs already authorize
// them per-category -- authorizeCategoryAccess checks director_assignments).
//
// "testing" was missing here, so an EFHA director opening Raw Testing Scores
// was redirected to the sign-in page with a perfectly valid token. It reads as
// being logged out at random, and that is exactly how it was reported.
const DIRECTOR_ASSOC_ALLOW = /^\/association\/dashboard\/category\/[^/]+\/(groups|flags|testing)(\/|$)/;

// Where a signed-in user belongs when they land somewhere their role cannot go.
// Mirrors roleRedirect() in lib/auth.js, inlined because middleware runs on the
// edge and lib/auth.js pulls in the database client.
function homeForRole(role) {
  switch (role) {
    case "super_admin": return "/admin/god-mode";
    case "service_provider_admin": return "/service-provider/dashboard";
    case "goalie_service_provider_admin": return "/goalie-provider/dashboard";
    case "association_admin": return "/association/dashboard";
    case "director": return "/director/dashboard";
    case "service_provider_tester": return "/tester/dashboard";
    case "volunteer": return "/checkin";
    default: return "/evaluator/dashboard";
  }
}

// An evaluator designated as an association's LEAD (evaluator_memberships.
// is_lead) gets admin-equivalent access to that one association -- but
// nothing in their JWT role reflects that (is_lead is a per-org DB flag, not
// a role). This is the same shape as the director carve-out above: coarse,
// role-based pass-through at the routing layer, with the REAL per-org check
// enforced by every data endpoint underneath via evaluator_memberships
// (authorizeOrgAccess / authorizeCategoryAccess already grant access there
// through a genuine membership row -- setLead() creates one on the
// association itself even for an SP-side evaluator with no other tie to it).
// Someone who is NOT actually a lead of the association in the URL reaches
// an empty/403'd page, never real data -- it is not possible to widen this
// past what the DB says, no matter what URL is typed.
const LEAD_ELIGIBLE_ROLES = new Set(["service_provider_evaluator", "association_evaluator"]);

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // Allow root path (redirects to /landing via page.jsx)
  if (pathname === "/") return NextResponse.next();

  // Allow public paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Get token from cookie
  const token = request.cookies.get("auth-token")?.value;

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/account/signin", request.url));
  }

  try {
    const { payload } = await jwtVerify(token, SECRET);

    if (payload.role === "director" && DIRECTOR_ASSOC_ALLOW.test(pathname)) {
      return NextResponse.next();
    }

    if (LEAD_ELIGIBLE_ROLES.has(payload.role) && pathname.startsWith("/association/dashboard")) {
      return NextResponse.next();
    }

    // Check role-based access
    for (const [route, roles] of Object.entries(ROLE_ROUTES)) {
      if (pathname.startsWith(route)) {
        if (!roles.includes(payload.role)) {
          if (pathname.startsWith("/api/")) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
          }
          // This user IS signed in -- their role just cannot open this page.
          // Sending them to the sign-in screen made that look like the session
          // had expired, so they signed in again and hit the same wall. Send
          // them somewhere they can actually be instead.
          const home = homeForRole(payload.role);
          if (!pathname.startsWith(home)) {
            return NextResponse.redirect(new URL(home, request.url));
          }
          // Their own home is what was refused -- bouncing there would loop.
          return NextResponse.redirect(new URL("/account/signin", request.url));
        }
        break;
      }
    }

    return NextResponse.next();
  } catch {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/account/signin", request.url));
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg$|.*\\.png$|.*\\.ico$|.*\\.jpg$|.*\\.webp$|sw\\.js$).*)"],
};


