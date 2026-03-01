import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const { pathname } = request.nextUrl;

  // Check if this is the app subdomain (app.domain.com)
  const isAppSubdomain = host.startsWith("app.");

  if (isAppSubdomain) {
    // Rewrite all requests on app.domain.com to /app/*
    // So app.domain.com/ → /app, app.domain.com/foo → /app/foo
    if (!pathname.startsWith("/app") && !pathname.startsWith("/api") && !pathname.startsWith("/_next")) {
      const url = request.nextUrl.clone();
      url.pathname = `/app${pathname === "/" ? "" : pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  // Run on all routes except static files
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
