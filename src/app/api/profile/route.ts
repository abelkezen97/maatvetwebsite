import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { profile } = await requireAuth();
    return NextResponse.json({ profile });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { profile, supabase } = await requireAuth();

    const body = await request.json();
    const { full_name, name, phone } = body;

    const newName = (full_name || name || "").trim();
    if (!newName) {
      return NextResponse.json({ error: "Full Name is required" }, { status: 400 });
    }

    // STRICT PERMISSION BOUNDARY: Users may ONLY update full_name and phone.
    // role and country are explicitly excluded and can only be modified by Super Admin.
    const updatePayload = {
      full_name: newName,
      phone: (phone || "").trim(),
      updated_at: new Date().toISOString(),
    };

    const { data: updatedProfile, error } = await supabase
      .from("profiles")
      .update(updatePayload)
      .eq("id", profile.id)
      .select("*")
      .single();

    if (error) {
      console.error("Error updating self profile:", error);
      return NextResponse.json({ error: error.message || "Failed to update profile" }, { status: 500 });
    }

    return NextResponse.json({ success: true, profile: updatedProfile });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error updating self profile:", error);
    return NextResponse.json({ error: error.message || "Failed to update profile" }, { status: 500 });
  }
}
