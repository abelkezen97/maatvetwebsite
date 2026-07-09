"use client";

import React from "react";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { User, Shield, Info, CheckCircle2, RefreshCw } from "lucide-react";

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings & Config"
        description="Review active user credentials, system configs, and synchronization logs."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Side: General Profile & App Configuration (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* User Profile Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              Active User Account
            </h3>
            
            {user && (
              <div className="flex flex-col sm:flex-row items-center gap-6 p-4 bg-slate-50 border border-slate-100 rounded-xl">
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    className="h-16 w-16 rounded-2xl object-cover border border-slate-200 shadow-sm"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-white font-bold text-xl">
                    {user.name.charAt(0)}
                  </div>
                )}
                <div className="space-y-1 text-center sm:text-left">
                  <div className="text-lg font-bold text-slate-800">{user.name}</div>
                  <div className="text-sm font-semibold text-slate-500">{user.email}</div>
                  <div className="inline-flex items-center gap-1 text-[10px] font-bold text-accent uppercase tracking-wider bg-white px-2 py-0.5 rounded border border-slate-100 mt-2">
                    <Shield className="w-3 h-3" />
                    Role: {user.role === "Salesman" ? "Business Development Manager (UAE)" : user.role}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Regional & Sales System Configuration */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Info className="w-5 h-5 text-accent" />
              Business Parameters (Phase 1 Mock)
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Country / Region
                </label>
                <input
                  type="text"
                  disabled
                  value="United Arab Emirates (UAE)"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 text-sm font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Sales Tax / VAT Rate
                </label>
                <input
                  type="text"
                  disabled
                  value="5% Standard Rate"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 text-sm font-semibold"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Standard PDF Quotation Terms & Footer
                </label>
                <textarea
                  rows={2}
                  disabled
                  value="This is a computer generated quote. Pricing is valid for 30 days from generation date."
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 text-sm font-semibold"
                />
              </div>
            </div>
          </div>

        </div>

        {/* Right Side: Sync status log (1/3 width) */}
        <div className="space-y-6">
          {user?.role === "Admin" && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-slate-800 flex items-center justify-between">
                Database Sync
                <RefreshCw className="w-4 h-4 text-slate-400 animate-spin" />
              </h3>

              <div className="space-y-3.5">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wide">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  Next.js App router: Connected
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wide">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  Session middleware: Guard Active
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wide">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  PDF Compiler: Compiled
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Last Local Compilation
                </span>
                <span className="block text-xs font-bold text-slate-600 mt-1">
                  July 6, 2026 - 12:07 PM
                </span>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
