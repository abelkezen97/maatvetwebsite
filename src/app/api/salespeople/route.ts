import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { profile, supabase } = await requireAuth();

    const { searchParams } = new URL(request.url);

    let query = supabase
      .from("profiles")
      .select("id, full_name, email, role, country, is_active")
      .eq("role", "salesperson")
      .eq("is_active", true)
      .order("full_name", { ascending: true });

    // Every role sees only its own country (there is no global admin).
    query = query.eq("country", profile.country);

    const { data, error } = await query;

    if (error) {
      console.error("Failed to load salespeople:", error);
      return NextResponse.json({ salespeople: [] }, { status: 500 });
    }

    return NextResponse.json({ salespeople: data || [] });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ salespeople: [] }, { status: 500 });
  }
}
