import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { createAdminClient } from "@/utils/supabase/admin";
import { mapSeriesFromDb, seriesSlotsFor } from "@/lib/db/documentSeries";

export const dynamic = "force-dynamic";

const PREFIX_RE = /^[A-Za-z0-9][A-Za-z0-9\-/]{0,11}$/;

async function loadTarget(client: any, id: string, country: string) {
  const { data } = await client
    .from("profiles")
    .select("id, full_name, role, country")
    .eq("id", id)
    .maybeSingle();
  return data && data.country === country ? data : null;
}

/**
 * GET /api/admin/users/:id/series   (Admin of the user's country)
 * The salesman's number series and which ones he can have.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { profile, supabase } = await requireAuth(["super_admin"]);
    const { id } = await params;
    const admin = createAdminClient() || supabase;

    const target = await loadTarget(admin, id, profile.country);
    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { data, error } = await admin.from("document_series").select("*").eq("salesman_id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      user: { id: target.id, fullName: target.full_name, role: target.role, country: target.country },
      slots: seriesSlotsFor(target.country),
      series: (data || []).map(mapSeriesFromDb),
    });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Failed to load number series" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/users/:id/series   (Admin of the user's country)
 * Body: { series: [{ docType, billingSeries, prefix, nextNumber, padLength }] }
 * A slot sent with an empty prefix is removed (no series set up).
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { profile, supabase } = await requireAuth(["super_admin"]);
    const { id } = await params;
    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Server misconfiguration: SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
    }

    const target = await loadTarget(admin, id, profile.country);
    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const incoming: any[] = Array.isArray(body?.series) ? body.series : [];
    const slots = seriesSlotsFor(target.country);

    const upserts: any[] = [];
    const removals: Array<{ docType: string; billingSeries: string }> = [];

    for (const slot of slots) {
      const row = incoming.find((s) => s?.docType === slot.docType && s?.billingSeries === slot.billingSeries);
      if (!row) continue;
      const prefix = String(row.prefix || "").trim();
      if (!prefix) {
        removals.push(slot);
        continue;
      }
      if (!PREFIX_RE.test(prefix)) {
        return NextResponse.json(
          { error: `Prefix "${prefix}": use up to 12 letters, digits, "-" or "/", starting with a letter or digit.` },
          { status: 400 }
        );
      }
      const nextNumber = Math.floor(Number(row.nextNumber));
      const padLength = Math.floor(Number(row.padLength ?? 4));
      if (!Number.isFinite(nextNumber) || nextNumber < 1) {
        return NextResponse.json({ error: `Next number for ${prefix} must be 1 or more.` }, { status: 400 });
      }
      if (!Number.isFinite(padLength) || padLength < 1 || padLength > 8) {
        return NextResponse.json({ error: "Digits must be between 1 and 8." }, { status: 400 });
      }
      upserts.push({
        salesman_id: id,
        doc_type: slot.docType,
        billing_series: slot.billingSeries,
        prefix,
        next_number: nextNumber,
        pad_length: padLength,
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      });
    }

    // Prefixes must differ between this salesman's own invoice series too.
    const seen = new Set<string>();
    for (const u of upserts) {
      const key = `${u.doc_type}:${u.prefix.toUpperCase()}`;
      if (seen.has(key)) {
        return NextResponse.json(
          { error: `Prefix "${u.prefix}" is used twice for ${u.doc_type}s. Each series needs its own prefix.` },
          { status: 400 }
        );
      }
      seen.add(key);
    }

    for (const r of removals) {
      await admin
        .from("document_series")
        .delete()
        .eq("salesman_id", id)
        .eq("doc_type", r.docType)
        .eq("billing_series", r.billingSeries);
    }

    if (upserts.length > 0) {
      const { error } = await admin
        .from("document_series")
        .upsert(upserts, { onConflict: "salesman_id,doc_type,billing_series" });
      if (error) {
        if (error.code === "23505") {
          return NextResponse.json(
            { error: "One of these prefixes is already used by another salesman. Choose a different prefix." },
            { status: 409 }
          );
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    try {
      await supabase.from("admin_audit_logs").insert([{
        performed_by: profile.id,
        action: "UPDATE_NUMBER_SERIES",
        target_user: id,
        details: { series: upserts.map((u) => ({ doc: u.doc_type, series: u.billing_series, prefix: u.prefix, next: u.next_number })), removed: removals },
      }]);
    } catch {
      // audit logging must not block the change
    }

    const { data } = await admin.from("document_series").select("*").eq("salesman_id", id);
    return NextResponse.json({ success: true, series: (data || []).map(mapSeriesFromDb) });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error.message || "Failed to save number series" }, { status: 500 });
  }
}
