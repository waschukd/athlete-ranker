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
  "/api/auth/login",
  "/api/auth/logout",
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
  "/report",
  "/api/report",
  "/api/payments",
  "/_next",
  "/favicon",
];

const ROLE_ROUTES = {
  "/admin/god-mode": ["super_admin"],
  "/service-provider": ["service_provider_admin", "super_admin"],
  "/association/dashboard": ["association_admin", "super_admin", "service_provider_admin"],
  "/association": ["association_admin", "super_admin", "service_provider_admin"],
  "/player": ["association_admin", "super_admin", "service_provider_admin", "director", "association_evaluator", "service_provider_evaluator"],
  "/director/dashboard": ["director", "association_admin", "super_admin"],
  "/evaluator": ["association_evaluator", "service_provider_evaluator", "super_admin", "association_admin", "service_provider_admin", "director"],
};

// Directors are not association admins, but an assigned director may use the
// group-building and flags sub-pages (the APIs already authorize them per-category).
const DIRECTOR_ASSOC_ALLOW = /^\/association\/dashboard\/category\/[^/]+\/(groups|flags)(\/|$)/;

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

    // Check role-based access
    for (const [route, roles] of Object.entries(ROLE_ROUTES)) {
      if (pathname.startsWith(route)) {
        if (!roles.includes(payload.role)) {
          if (pathname.startsWith("/api/")) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
          }
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


