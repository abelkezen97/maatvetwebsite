"use client";

import React, { useState } from "react";
import { UserCountry } from "@/types";

const COUNTRY_INFO: Record<UserCountry, { name: string; currency: string; flag: string }> = {
  UAE: { name: "United Arab Emirates", currency: "AED", flag: "🇦🇪" },
  Oman: { name: "Oman", currency: "OMR", flag: "🇴🇲" },
};

interface CountryPickerProps {
  name: string;
  countries: UserCountry[];
  current: UserCountry;
  onChoose: (country: UserCountry) => Promise<{ success: boolean; error?: string }>;
}

/** Full-screen "Which country?" step shown after sign-in to users who cover several countries. */
export function CountryPicker({ name, countries, current, onChoose }: CountryPickerProps) {
  const [busy, setBusy] = useState<UserCountry | null>(null);
  const [error, setError] = useState("");

  const choose = async (country: UserCountry) => {
    setBusy(country);
    setError("");
    const result = await onChoose(country);
    if (!result.success) {
      setError(result.error || "Could not open that country");
      setBusy(null);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#06101E] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src="/inverted.svg" alt="MAAT" className="mb-4 h-14 w-14 object-contain" />
          <h1 className="text-xl font-extrabold text-white">Welcome, {name}</h1>
          <p className="mt-1.5 text-sm text-slate-300">Which country do you want to work in?</p>
        </div>

        <div className="space-y-3">
          {countries.map((country) => {
            const info = COUNTRY_INFO[country];
            const isLast = country === current;
            return (
              <button
                key={country}
                type="button"
                disabled={busy !== null}
                onClick={() => choose(country)}
                className="flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-left transition hover:border-teal-400/40 hover:bg-white/10 disabled:cursor-wait disabled:opacity-60 cursor-pointer"
              >
                <span className="text-3xl leading-none" aria-hidden>
                  {info.flag}
                </span>
                <span className="flex-1">
                  <span className="block text-base font-bold text-white">{info.name}</span>
                  <span className="block text-xs text-slate-400">
                    Amounts in {info.currency}
                    {isLast ? " · last opened" : ""}
                  </span>
                </span>
                {busy === country && (
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                )}
              </button>
            );
          })}
        </div>

        {error && <p className="mt-4 text-center text-sm font-semibold text-rose-300">{error}</p>}

        <p className="mt-6 text-center text-xs text-slate-400">You can switch country any time from the menu.</p>
      </div>
    </div>
  );
}
