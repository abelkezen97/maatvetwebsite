import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { loadWorkSchedule } from "@/lib/db/workSchedule";

export const dynamic = "force-dynamic";

/** GET: the working week of the user's country. PUT: change it (admin only). */
export async function GET() {
  try {
    const { profile, supabase } = await requireAuth();
    return NextResponse.json(await loadWorkSchedule(supabase, profile.country));
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Could not load the working week" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { profile, supabase } = await requireAuth();
    if (profile.role !== "super_admin") {
      return NextResponse.json({ error: "Only the admin can change the working week." }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const off: number[] = Array.from(new Set<number>((Array.isArray(body.weeklyOff) ? body.weeklyOff : []).map(Number)))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
      .sort();
    if (off.length > 3) {
      return NextResponse.json({ error: "A week needs at least 4 working days." }, { status: 400 });
    }
    const holidays: string[] = Array.from(new Set<string>((Array.isArray(body.holidays) ? body.holidays : []).map((d: any) => String(d).slice(0, 10))))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort();
    const { error } = await supabase
      .from("work_schedule")
      .upsert({ country: profile.country, weekly_off: off, holidays, updated_by: profile.id, updated_at: new Date().toISOString() });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ weeklyOff: off, holidays });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Could not save the working week" }, { status: 500 });
  }
}
