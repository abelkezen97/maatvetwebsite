import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { createAdminClient } from "@/utils/supabase/admin";
import { workCountries } from "@/lib/auth/permissions";
import { UserCountry } from "@/types";

export const dynamic = "force-dynamic";

/**
 * Switch the signed-in user's active country (for users who cover several,
 * e.g. an accountant for both UAE and Oman). Everything in the app is scoped
 * to `profiles.country`, so changing it switches the whole app over.
 * Users may not change their own country directly (database rule), so this
 * runs with the service key after checking the country is one they cover.
 */
export async function POST(req: NextRequest) {
  try {
    const { profile } = await requireAuth();
    const body = await req.json().catch(() => ({}));
    const country = String(body?.country || "") as UserCountry;

    const allowed = workCountries(profile);
    if (!allowed.includes(country)) {
      return NextResponse.json({ error: `You don't have access to ${country || "that country"}.` }, { status: 403 });
    }
    if (country === profile.country) {
      return NextResponse.json({ success: true, country });
    }

    const adminClient = createAdminClient();
    if (!adminClient) {
      return NextResponse.json(
        { error: "Server misconfiguration: SUPABASE_SERVICE_ROLE_KEY is required to switch country." },
        { status: 500 }
      );
    }

    // Keep the full list (incl. the country being left) so the user can switch back.
    const { error } = await adminClient
      .from("profiles")
      .update({ country, countries: allowed, updated_at: new Date().toISOString() })
      .eq("id", profile.id);

    if (error) {
      return NextResponse.json({ error: `Could not switch country: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, country });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to switch country" }, { status: 500 });
  }
}
