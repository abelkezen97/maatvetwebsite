import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "./lib/auth";

export function middleware(request: NextRequest) {
  const cookieHeader = request.headers.get("cookie") || "";
  const session = getServerSession(cookieHeader);
  const { pathname } = request.nextUrl;

  // Protected paths
  const isProtectedRoute =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/products") ||
    pathname.startsWith("/quotes") ||
    pathname.startsWith("/invoices") ||
    pathname.startsWith("/customers") ||
    pathname.startsWith("/settings");

  // Auth paths
  const isAuthRoute = pathname === "/login";

  if (isProtectedRoute && !session) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthRoute && session) {
    const dashboardUrl = new URL("/dashboard", request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  // Root redirect
  if (pathname === "/") {
    if (session) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    } else {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/dashboard/:path*",
    "/products/:path*",
    "/quotes/:path*",
    "/invoices/:path*",
    "/customers/:path*",
    "/settings/:path*",
  ],
};
