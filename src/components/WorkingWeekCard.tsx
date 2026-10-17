"use client";

import React, { useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, Plus, X } from "lucide-react";
import { WEEKDAYS } from "@/lib/db/workSchedule";

/** Settings card: which days of the week are days off, plus public holidays. */

const ORDER = [6, 0, 1, 2, 3, 4, 5]; // Saturday first

export function WorkingWeekCard({ country }: { country: string }) {
  const [off, setOff] = useState<number[]>([5]);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [newDay, setNewDay] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/work-schedule", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.weeklyOff)) setOff(d.weeklyOff);
        if (Array.isArray(d.holidays)) setHolidays(d.holidays);
      })
      .finally(() => setLoaded(true));
  }, []);

  const toggle = (i: number) => {
    setMsg(null);
    setOff((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]));
  };
  const addHoliday = () => {
    if (!newDay || holidays.includes(newDay)) return;
    setHolidays([...holidays, newDay].sort());
    setNewDay("");
    setMsg(null);
  };
  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/work-schedule", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ weeklyOff: off, holidays }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Could not save");
      setMsg({ ok: true, text: "Saved. Reports now use this working week." });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs space-y-4">
      <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
        <div className="p-2.5 rounded-xl bg-teal-50 text-[#165B66]">
          <CalendarDays className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-sm font-extrabold text-[#1B2A4A] uppercase tracking-wider">Working week · {country}</h3>
          <p className="text-[11px] text-slate-500 font-semibold">{7 - off.length} working days a week. Reports and averages count only working days.</p>
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-500 mb-2">Tap the days that are days off</p>
        <div className="flex flex-wrap gap-2">
          {ORDER.map((i) => {
            const isOff = off.includes(i);
            return (
              <button
                key={i}
                type="button"
                disabled={!loaded}
                onClick={() => toggle(i)}
                className={`h-11 min-w-[5.5rem] px-3 rounded-xl border text-sm font-semibold transition ${
                  isOff ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-emerald-50 border-emerald-200 text-emerald-800"
                }`}
              >
                {WEEKDAYS[i]}
                <span className="block text-[10px] font-medium">{isOff ? "Day off" : "Working"}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-500 mb-2">Public holidays and other days closed</p>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={newDay} onChange={(e) => setNewDay(e.target.value)} className="h-10 px-3 rounded-xl border border-slate-200 text-sm" />
          <button type="button" onClick={addHoliday} disabled={!newDay} className="h-10 inline-flex items-center gap-1.5 px-3 rounded-xl bg-slate-100 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-40">
            <Plus className="w-4 h-4" /> Add day
          </button>
        </div>
        {holidays.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {holidays.map((d) => (
              <li key={d} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 pl-3 pr-1.5 py-1 text-xs font-semibold text-slate-700">
                {fmt(d)}
                <button type="button" onClick={() => setHolidays(holidays.filter((x) => x !== d))} className="p-0.5 rounded-full hover:bg-slate-200" aria-label="Remove">
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={busy || !loaded} className="h-10 px-5 rounded-xl bg-accent text-white text-sm font-bold hover:bg-accent-hover disabled:opacity-40">
          {busy ? "Saving…" : "Save working week"}
        </button>
        {msg && (
          <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>
            {msg.ok && <CheckCircle2 className="w-4 h-4" />} {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
