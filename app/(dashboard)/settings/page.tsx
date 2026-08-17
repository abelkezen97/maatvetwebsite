"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { User, Shield, Info, Users, Save, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";

export default function SettingsPage() {
  const { user, isSuperAdmin, isAccountant } = useAuth();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setFullName(user.name || "");
      setPhone("");
    }
  }, [user]);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          phone: phone,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Failed to update profile");
      } else {
        setSuccessMsg("Profile updated successfully!");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to update profile");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="w-full">
      <PageHeader
        title="Administration & Settings Console"
        description="Configure enterprise organization parameters, user roles, country governance, document sequences, and financial parameters."
      />

      <div className="p-6 md:p-8 lg:p-10 max-w-[1600px] mx-auto space-y-8 pb-12">

      {/* Alert Messages */}
      {errorMsg && (
        <div className="flex items-center gap-2.5 rounded-xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-700">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="font-semibold">{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2.5 rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-700">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span className="font-semibold">{successMsg}</span>
        </div>
      )}

      {/* Structured Administration Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* 1. Organization Section */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            <div className="p-2.5 rounded-xl bg-[#1B2A4A]/10 text-[#1B2A4A]">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-[#1B2A4A] uppercase tracking-wider">Organization</h3>
              <p className="text-[11px] text-slate-400 font-semibold">Legal entity & business profile</p>
            </div>
          </div>
          <div className="space-y-2 text-xs font-semibold text-slate-600">
            <div className="flex justify-between py-1.5 border-b border-slate-50">
              <span className="text-slate-400">Legal Entity:</span>
              <span className="font-bold text-slate-900">MAAT Group Vet Med</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-50">
              <span className="text-slate-400">Trading Name:</span>
              <span className="font-bold text-slate-900">MAAT Veterinary Medicine</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">TRN / Tax ID:</span>
              <span className="font-mono font-bold text-slate-800">100482910300003</span>
            </div>
          </div>
        </div>

        {/* 2. Users & Roles Section */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            <div className="p-2.5 rounded-xl bg-purple-50 text-purple-700">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-[#1B2A4A] uppercase tracking-wider">Users & Roles</h3>
              <p className="text-[11px] text-slate-400 font-semibold">User accounts & permissions</p>
            </div>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            Manage field sales staff, accountant permissions, and administrator credentials.
          </p>
          {isSuperAdmin ? (
            <Link
              href="/users"
              className="inline-flex items-center justify-between w-full px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-[#1B2A4A] hover:text-white text-[#1B2A4A] font-bold text-xs transition cursor-pointer"
            >
              <span>Manage Users & Staff &rarr;</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          ) : (
            <span className="text-[11px] font-bold text-slate-400 italic">Super Admin Restricted</span>
          )}
        </div>

        {/* 3. Countries Section */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            <div className="p-2.5 rounded-xl bg-amber-50 text-amber-700">
              <Info className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-[#1B2A4A] uppercase tracking-wider">Countries</h3>
              <p className="text-[11px] text-slate-400 font-semibold">Territory governance</p>
            </div>
          </div>
          <div className="space-y-2 text-xs font-semibold">
            <div className="flex justify-between items-center py-1.5 border-b border-slate-50">
              <span className="text-slate-700">🇦🇪 United Arab Emirates</span>
              <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">Active (AED)</span>
            </div>
            <div className="flex justify-between items-center py-1.5">
              <span className="text-slate-700">🇴🇲 Sultanate of Oman</span>
              <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">Active (OMR)</span>
            </div>
          </div>
        </div>

        {/* 4. Financial Settings Section */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-[#1B2A4A] uppercase tracking-wider">Financial Settings</h3>
              <p className="text-[11px] text-slate-400 font-semibold">VAT & credit rules</p>
            </div>
          </div>
          <div className="space-y-2 text-xs font-semibold text-slate-600">
            <div className="flex justify-between py-1.5 border-b border-slate-50">
              <span className="text-slate-400">UAE VAT Rate:</span>
              <span className="font-bold text-slate-900">0% Exempt</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">Oman VAT Rate:</span>
              <span className="font-bold text-slate-900">5.0% Standard</span>
            </div>
          </div>
        </div>

        {/* 5. Invoice Settings Section */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            <div className="p-2.5 rounded-xl bg-sky-50 text-sky-700">
              <Save className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-[#1B2A4A] uppercase tracking-wider">Invoice Settings</h3>
              <p className="text-[11px] text-slate-400 font-semibold">Sequencing & layouts</p>
            </div>
          </div>
          <div className="space-y-2 text-xs font-semibold text-slate-600">
            <div className="flex justify-between py-1.5 border-b border-slate-50">
              <span className="text-slate-400">Sequence Pattern:</span>
              <span className="font-mono font-bold text-slate-800">INV-YYYY-XXXXXX</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">Thermal Printer:</span>
              <span className="font-bold text-slate-900">80mm POS Thermal</span>
            </div>
          </div>
        </div>

        {/* 6. Quotation Settings Section */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700">
              <Info className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-[#1B2A4A] uppercase tracking-wider">Quotation Settings</h3>
              <p className="text-[11px] text-slate-400 font-semibold">Proposals & pricing validity</p>
            </div>
          </div>
          <div className="space-y-2 text-xs font-semibold text-slate-600">
            <div className="flex justify-between py-1.5 border-b border-slate-50">
              <span className="text-slate-400">Sequence Pattern:</span>
              <span className="font-mono font-bold text-slate-800">Q-YYYY-XXXXXX</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">Default Validity:</span>
              <span className="font-bold text-slate-900">30 Calendar Days</span>
            </div>
          </div>
        </div>

        {/* 7. Receipt Settings Section */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-[#1B2A4A] uppercase tracking-wider">Receipt Settings</h3>
              <p className="text-[11px] text-slate-400 font-semibold">Collection receipts</p>
            </div>
          </div>
          <div className="space-y-2 text-xs font-semibold text-slate-600">
            <div className="flex justify-between py-1.5 border-b border-slate-50">
              <span className="text-slate-400">Sequence Pattern:</span>
              <span className="font-mono font-bold text-slate-800">REC-YYYY-XXXXXX</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">Methods Allowed:</span>
              <span className="font-bold text-slate-900">Cash, Card, Transfer, Cheque</span>
            </div>
          </div>
        </div>

        {/* 8. Product Catalog Section */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            <div className="p-2.5 rounded-xl bg-rose-50 text-rose-700">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-[#1B2A4A] uppercase tracking-wider">Product Catalog</h3>
              <p className="text-[11px] text-slate-400 font-semibold">Medicine master data</p>
            </div>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            Manage global medicine catalog, price lists, and category trees.
          </p>
          <Link
            href="/products"
            className="inline-flex items-center justify-between w-full px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-[#1B2A4A] hover:text-white text-[#1B2A4A] font-bold text-xs transition cursor-pointer"
          >
            <span>Open Product Catalog &rarr;</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* 9. System Section */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            <div className="p-2.5 rounded-xl bg-slate-100 text-slate-700">
              <Info className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-[#1B2A4A] uppercase tracking-wider">System</h3>
              <p className="text-[11px] text-slate-400 font-semibold">Engine parameters</p>
            </div>
          </div>
          <div className="space-y-2 text-xs font-semibold text-slate-600">
            <div className="flex justify-between py-1.5 border-b border-slate-50">
              <span className="text-slate-400">Database Engine:</span>
              <span className="font-bold text-slate-900">PostgreSQL (Supabase)</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">Security Audit:</span>
              <span className="font-bold text-emerald-600">RLS Enforced</span>
            </div>
          </div>
        </div>

      </div>

      {/* Self-Service My Account Profile Section */}
      {user && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-6">
          <div className="border-b border-slate-100 pb-4 flex items-center justify-between">
            <h3 className="text-base font-bold text-[#1B2A4A] flex items-center gap-2">
              <User className="w-5 h-5 text-accent" />
              My Personal Account Profile
            </h3>
            <span className="text-xs font-semibold text-slate-400">
              Self-Service Account Settings
            </span>
          </div>

          <form onSubmit={handleProfileSave} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:border-[#1B2A4A]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Phone Number
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+971 50 123 4567"
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:border-[#1B2A4A]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Email Address (Immutable)
              </label>
              <input
                type="email"
                disabled
                value={user.email}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-500 cursor-not-allowed"
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1B2A4A] text-white text-xs font-bold hover:bg-[#15223c] transition disabled:opacity-50 cursor-pointer shadow-sm"
              >
                <Save className="w-4 h-4" />
                {isSaving ? "Saving..." : "Save Profile"}
              </button>
            </div>
          </form>
        </div>
      )}
      </div>
    </div>
  );
}
