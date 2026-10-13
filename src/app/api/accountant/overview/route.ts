import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { buildAccountantOverview } from "@/lib/db/accountantOverview";

export const dynamic = "force-dynamic";

/** GET /api/accountant/overview: the office dashboard for the user's active country (admin or accountant). */
export async function GET() {
  try {
    const { profile, supabase } = await requireAuth(["super_admin", "accountant"]);
    const overview = await buildAccountantOverview(supabase, profile.role, profile.country);
    return NextResponse.json(overview);
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error building accountant overview:", error);
    return NextResponse.json({ error: error.message || "Failed to load the dashboard" }, { status: 500 });
  }
}
