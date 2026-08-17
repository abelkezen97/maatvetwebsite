import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { Permissions } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { profile, supabase } = await requireAuth();

    if (!Permissions.canViewSettings(profile)) {
      return NextResponse.json({ error: "Forbidden: Only super_admin can view settings" }, { status: 403 });
    }

    const { data: settingsData } = await supabase.from("settings").select("*").maybeSingle();
    const { data: docData } = await supabase.from("document_settings").select("*").maybeSingle();

    return NextResponse.json({
      settings: settingsData || {
        companyName: "MAAT VETERINARY TRADING FZC",
        companyEmail: "sales@maatvet.com",
        companyPhone: "+971 50 123 4567",
        companyAddress: "Ajman Free Zone, United Arab Emirates",
        currency: "AED",
      },
      documentSettings: docData || {
        quotePrefix: "QT-2026-",
        invoicePrefix: "INV-2026-",
        receiptPrefix: "REC-2026-",
        quoteFooter: "This is a computer generated quote. Pricing valid for 30 days.",
        invoiceFooter: "Thank you for your business!",
      },
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to load settings:", error);
    return NextResponse.json({ settings: {}, documentSettings: {} });
  }
}

export async function PUT(request: Request) {
  try {
    const { profile, supabase } = await requireAuth();

    if (!Permissions.canManageSettings(profile)) {
      return NextResponse.json({ error: "Forbidden: Only super_admin can manage settings" }, { status: 403 });
    }

    const body = await request.json();
    const { settings, documentSettings } = body;

    if (settings) {
      settings.updated_by = profile.id;
      settings.updated_at = new Date().toISOString();
      await supabase.from("settings").upsert(settings);
    }

    if (documentSettings) {
      documentSettings.updated_by = profile.id;
      documentSettings.updated_at = new Date().toISOString();
      await supabase.from("document_settings").upsert(documentSettings);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to update settings:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
