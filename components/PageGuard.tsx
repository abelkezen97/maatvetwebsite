"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface PageGuardProps {
  children: React.ReactNode;
}

export function PageGuard({ children }: PageGuardProps) {
  const pathname = usePathname();
  const { permissions, loading, user } = useAuth();

  if (loading) return null;

  // Evaluate permission requirements based on pathname
  let isAllowed = true;

  if (permissions) {
    if (pathname.startsWith("/settings")) {
      isAllowed = permissions.canViewSettings;
    } else if (pathname.startsWith("/products")) {
      isAllowed = permissions.canViewProducts;
    } else if (pathname.startsWith("/quotes/new")) {
      isAllowed = permissions.canCreateQuotation;
    } else if (pathname.startsWith("/quotes")) {
      isAllowed = permissions.canViewQuotations;
    } else if (pathname.startsWith("/invoices")) {
      isAllowed = permissions.canViewInvoices;
    } else if (pathname.startsWith("/receipts")) {
      isAllowed = permissions.canViewReceipts;
    } else if (pathname.startsWith("/customers")) {
      isAllowed = permissions.canViewCustomers;
    }
  }

  if (!isAllowed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8 bg-white rounded-3xl border border-slate-200/60 shadow-sm my-8">
        <div className="w-16 h-16 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-600 mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight">
          Access Restricted (403 Forbidden)
        </h2>
        <p className="text-sm font-medium text-slate-500 max-w-md mt-2 mb-6">
          Your assigned profile role (<span className="font-bold uppercase text-slate-700">{user?.role}</span>) does not have permission to access the requested route (<code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-rose-600 font-mono">{pathname}</code>).
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1B2A4A] text-white text-sm font-bold hover:bg-[#15223c] transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Return to Dashboard
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
