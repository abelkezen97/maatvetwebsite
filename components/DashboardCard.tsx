"use client";

import React from "react";
import { LucideIcon, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

export type CardTheme = "teal" | "emerald" | "indigo" | "amber" | "rose";

interface DashboardCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  theme?: CardTheme;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  onClick?: () => void;
}

const themeStyles: Record<CardTheme, {
  badgeBg: string;
  iconColor: string;
  accentBar: string;
  tagBg: string;
  tagText: string;
}> = {
  teal: {
    badgeBg: "bg-teal-50/90 border-teal-100 text-[#165B66]",
    iconColor: "text-[#165B66]",
    accentBar: "from-[#165B66] via-[#256874] to-[#0B1528]",
    tagBg: "bg-teal-50 text-teal-800 border-teal-200/60",
    tagText: "text-teal-800"
  },
  emerald: {
    badgeBg: "bg-emerald-50/90 border-emerald-100 text-emerald-700",
    iconColor: "text-emerald-700",
    accentBar: "from-emerald-600 via-teal-600 to-[#165B66]",
    tagBg: "bg-emerald-50 text-emerald-800 border-emerald-200/60",
    tagText: "text-emerald-800"
  },
  indigo: {
    badgeBg: "bg-indigo-50/90 border-indigo-100 text-indigo-700",
    iconColor: "text-indigo-700",
    accentBar: "from-indigo-600 via-blue-600 to-[#0B1528]",
    tagBg: "bg-indigo-50 text-indigo-800 border-indigo-200/60",
    tagText: "text-indigo-800"
  },
  amber: {
    badgeBg: "bg-amber-50/90 border-amber-100 text-amber-700",
    iconColor: "text-amber-700",
    accentBar: "from-amber-500 via-orange-500 to-rose-600",
    tagBg: "bg-amber-50 text-amber-800 border-amber-200/60",
    tagText: "text-amber-800"
  },
  rose: {
    badgeBg: "bg-rose-50/90 border-rose-100 text-rose-700",
    iconColor: "text-rose-700",
    accentBar: "from-rose-500 via-pink-600 to-amber-600",
    tagBg: "bg-rose-50 text-rose-800 border-rose-200/60",
    tagText: "text-rose-800"
  }
};

export function DashboardCard({ 
  title, 
  value, 
  description, 
  icon: Icon, 
  theme = "teal",
  trend, 
  onClick 
}: DashboardCardProps) {
  const { t, translateBusinessText, isRtl } = useLanguage();
  const selectedTheme = themeStyles[theme] || themeStyles.teal;

  const translatedTitle = translateBusinessText(title);
  const translatedDesc = description ? translateBusinessText(description) : undefined;

  // Format value text cleanly
  const valueStr = String(value);
  const isAED = valueStr.startsWith("AED ");
  const cleanValue = isAED ? valueStr.replace("AED ", "") : valueStr;
  const currencyLabel = isRtl ? "د.إ" : "AED";

  const content = (
    <div className="relative overflow-hidden bg-white border border-slate-200/90 rounded-2xl p-5 md:p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.04)] hover:shadow-[0_12px_30px_-6px_rgba(0,0,0,0.08)] hover:border-slate-300/90 transition-all duration-300 group flex flex-col justify-between h-full text-start">
      {/* Top Subtle Gradient Accent Bar */}
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${selectedTheme.accentBar} opacity-90`} />

      <div>
        {/* Header: Title & Icon Badge */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 group-hover:text-slate-700 transition-colors">
            {translatedTitle}
          </span>
          <div className={`p-2.5 rounded-2xl border ${selectedTheme.badgeBg} shadow-2xs group-hover:scale-110 transition-transform duration-300 shrink-0`}>
            <Icon className="w-5 h-5 stroke-[2]" />
          </div>
        </div>

        {/* Value Display */}
        <div className="my-1 space-y-1">
          {isAED && (
            <div>
              <span className={`inline-block text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${selectedTheme.tagBg} shadow-2xs tracking-wider`}>
                {currencyLabel}
              </span>
            </div>
          )}
          <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-none">
            {cleanValue}
          </h3>
        </div>
      </div>

      {/* Description / Trend Footer */}
      {(translatedDesc || trend) && (
        <div className="flex items-center gap-2 pt-3.5 mt-3.5 border-t border-slate-100 text-xs font-semibold">
          {trend && (
            <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-extrabold shrink-0 ${trend.isPositive ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60" : "bg-rose-50 text-rose-700 border border-rose-200/60"}`}>
              {trend.isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
              {trend.value}
            </span>
          )}
          {translatedDesc && (
            <span className="text-slate-400 font-medium truncate">
              {translatedDesc}
            </span>
          )}
        </div>
      )}
    </div>
  );

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className="w-full text-start focus:outline-none focus:ring-2 focus:ring-teal-500/20 rounded-2xl cursor-pointer"
      >
        {content}
      </button>
    );
  }

  return content;
}
