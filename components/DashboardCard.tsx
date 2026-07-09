import React from "react";
import { LucideIcon } from "lucide-react";

interface DashboardCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  onClick?: () => void;
}

export function DashboardCard({ title, value, description, icon: Icon, trend, onClick }: DashboardCardProps) {
  const content = (
    <>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold text-slate-500">{title}</span>
        <div className="p-2.5 bg-primary-light text-primary rounded-xl">
          <Icon className="w-5.5 h-5.5 stroke-[2]" />
        </div>
      </div>
      <div className="space-y-1">
        <h3 className="text-3xl font-bold text-slate-900 tracking-tight">{value}</h3>
        <div className="flex items-center gap-2 text-xs">
          {trend && (
            <span className={`font-semibold ${trend.isPositive ? "text-emerald-600" : "text-rose-600"}`}>
              {trend.isPositive ? "+" : ""}{trend.value}
            </span>
          )}
          {description && <span className="text-slate-400">{description}</span>}
        </div>
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className="w-full text-left bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/25"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="w-full bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
      {content}
    </div>
  );
}
