import { SupabaseClient } from "@supabase/supabase-js";

/**
 * The company's working week. Set by the admin in Settings. By default Friday
 * is the weekly day off (6 working days); public holidays can be added too.
 * Reports use it so an off day is not counted as a day without sales.
 */

export interface WorkSchedule {
  /** 0 = Sunday ... 6 = Saturday. */
  weeklyOff: number[];
  /** YYYY-MM-DD dates that are not working days. */
  holidays: string[];
}

export const DEFAULT_SCHEDULE: WorkSchedule = { weeklyOff: [5], holidays: [] };

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function loadWorkSchedule(client: SupabaseClient, country: string): Promise<WorkSchedule> {
  try {
    const { data } = await client.from("work_schedule").select("weekly_off, holidays").eq("country", country).maybeSingle();
    if (!data) return DEFAULT_SCHEDULE;
    return {
      weeklyOff: Array.isArray(data.weekly_off) ? data.weekly_off.map(Number) : DEFAULT_SCHEDULE.weeklyOff,
      holidays: Array.isArray(data.holidays) ? data.holidays.map((d: string) => String(d).slice(0, 10)) : [],
    };
  } catch {
    return DEFAULT_SCHEDULE;
  }
}

export function weekdayOf(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

export function isWorkingDay(day: string, s: WorkSchedule): boolean {
  return !s.weeklyOff.includes(weekdayOf(day)) && !s.holidays.includes(day);
}

/** Working days from `from` to `to`, both included. */
export function countWorkingDays(from: string, to: string, s: WorkSchedule): number {
  if (to < from) return 0;
  let n = 0;
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`).getTime();
  while (d.getTime() <= end) {
    const day = d.toISOString().slice(0, 10);
    if (isWorkingDay(day, s)) n += 1;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

export function describeSchedule(s: WorkSchedule): string {
  const off = s.weeklyOff.length ? s.weeklyOff.slice().sort().map((i) => WEEKDAYS[i]).join(" and ") : "no weekly day off";
  return `${7 - s.weeklyOff.length} working days a week · off: ${off}${s.holidays.length ? ` · ${s.holidays.length} holidays set` : ""}`;
}
