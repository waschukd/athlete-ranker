import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET || "fallback-secret-change-me");

const PUBLIC_PATHS = [
  "/account/signin",
  "/account/signup",
  "/account/forgot-password",
  "/account/reset-password",
  "/checkin",
  "/evaluator/signup",
  "/accept-invite",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/checkin",
  "/api/evaluator/register",
  "/api/evaluator/signup",
  "/api/evaluator/join",
  "/api/admin/accept-invite",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/_next",
  "/favicon",
];

const ROLE_ROUTES = {
  "/admin/god-mode": ["super_admin"],
  "/service-provider": ["service_provider_admin", "super_admin"],
  "/association/dashboard": ["association_admin", "super_admin", "service_provider_admin"],
  "/director/dashboard": ["director", "association_admin", "super_admin"],
  "/evaluator": ["association_evaluator", "service_provider_evaluator", "super_admin", "association_admin", "service_provider_admin", "director", "volunteer"],
};

export async function middleware(request) {
  const { pathname } = request.nextUrl;

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
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
