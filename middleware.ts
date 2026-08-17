import { type NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/dashboard/:path*",
    "/products/:path*",
    "/quotes/:path*",
    "/invoices/:path*",
    "/receipts/:path*",
    "/customers/:path*",
    "/settings/:path*",
  ],
};
