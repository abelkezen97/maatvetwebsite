"use client";

import React from "react";
import Link from "next/link";
import { BarChart3, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { reportsForRole, ReportDef } from "@/lib/reports/catalog";

const GROUPS: ReportDef["group"][] = ["Sales", "Receivables", "Cash & expenses", "Stock"];

export default function ReportsPage() {
  const { profile, isSalesperson, loading } = useAuth();
  if (loading || !profile) return null;
  const reports = reportsForRole(profile.role);

  return (
    <div className="w-full">
      <PageHeader
        title="Reports"
        description={
          isSalesperson
            ? "Your sales, customers, collections and expenses. Download any report as a PDF."
            : `Reports for ${profile.country}. Pick a period and filters, then download as a PDF.`
        }
      />
      <div className="px-6 py-5 md:px-6 md:py-6 max-w-[1200px] mx-auto space-y-6 text-start">
        {GROUPS.map((group) => {
          const list = reports.filter((r) => r.group === group);
          if (list.length === 0) return null;
          return (
            <section key={group}>
              <h2 className="mb-3 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">{group}</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((r) => (
                  <Link
                    key={r.key}
                    href={`/reports/${r.key}`}
                    className="group flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs transition hover:border-slate-300 hover:shadow-sm"
                  >
                    <div>
                      <div className="mb-2 flex items-center gap-2">
                        <span className="rounded-lg bg-teal-50 p-1.5 text-[#165B66]">
                          <BarChart3 className="h-4 w-4" />
                        </span>
                        <span className="text-sm font-extrabold text-[#1B2A4A] group-hover:text-accent">{r.title}</span>
                      </div>
                      <p className="text-xs font-semibold leading-relaxed text-slate-500">{r.description}</p>
                    </div>
                    <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-accent">
                      Open <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
