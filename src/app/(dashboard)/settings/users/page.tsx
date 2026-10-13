"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { 
  Users, 
  UserPlus, 
  ShieldCheck, 
  Globe, 
  CheckCircle2, 
  XCircle, 
  Edit3, 
  UserX, 
  KeyRound, 
  ArrowLeft,
  Search,
  AlertCircle,
  RefreshCw,
  Hash
} from "lucide-react";
import { Profile, UserRole, UserCountry } from "@/types";
import { useAuth } from "@/hooks/useAuth";
import { roleLabel, workCountries, ALL_COUNTRIES } from "@/lib/auth/permissions";
import { NumberSeriesDialog } from "@/components/NumberSeriesDialog";

export default function UserManagementPage() {
  const { isSuperAdmin, isAccountant, profile, loading: authLoading } = useAuth();
  // Only the admin manages logins; the accountant sees the list and sets number series.
  const canManageUsers = isSuperAdmin;
  // Admins create and manage users of their own country only.
  const ownCountry: UserCountry = profile?.country === "Oman" ? "Oman" : "UAE";
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal States
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);

  // Password reset dialog
  const [resetTarget, setResetTarget] = useState<Profile | null>(null);
  const [resetMode, setResetMode] = useState<"generate" | "manual">("generate");
  const [resetPassword, setResetPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetDone, setResetDone] = useState<{ password?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Number series dialog (salespeople)
  const [seriesTarget, setSeriesTarget] = useState<Profile | null>(null);

  // Form States
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    full_name: "",
    phone: "",
    role: "salesperson" as UserRole,
    country: "UAE" as UserCountry,
    // Extra country an accountant covers (both ticked = works in UAE and Oman).
    countries: [] as UserCountry[],
    is_active: true,
  });

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (res.ok) {
        setProfiles(data.profiles || []);
      } else {
        setErrorMsg(data.error || "Failed to load users");
      }
    } catch (err) {
      console.error("Error loading users:", err);
      setErrorMsg("Failed to load users from server");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin || isAccountant) {
      fetchUsers();
    }
  }, [isSuperAdmin, isAccountant]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, country: ownCountry }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Failed to create user");
        return;
      }

      setSuccessMsg(`User ${data.profile?.full_name || formData.full_name} created successfully!`);
      setIsCreateOpen(false);
      resetForm();
      fetchUsers();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to create user");
    }
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfile) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/admin/users/${editingProfile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: formData.full_name,
          phone: formData.phone,
          role: formData.role,
          country: formData.country,
          countries: formData.countries,
          is_active: formData.is_active,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Failed to update user");
        return;
      }

      setSuccessMsg(`User ${data.profile?.full_name || editingProfile.full_name} updated successfully!`);
      setEditingProfile(null);
      resetForm();
      fetchUsers();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to update user");
    }
  };

  const handleDeactivate = async (profileToDeactivate: Profile) => {
    if (!confirm(`Are you sure you want to deactivate ${profileToDeactivate.full_name}?`)) return;

    try {
      const res = await fetch(`/api/admin/users/${profileToDeactivate.id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Failed to deactivate user");
        return;
      }

      setSuccessMsg(`User ${profileToDeactivate.full_name} has been deactivated.`);
      fetchUsers();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to deactivate user");
    }
  };

  const openResetDialog = (p: Profile) => {
    setResetTarget(p);
    setResetMode("generate");
    setResetPassword("");
    setResetError(null);
    setResetDone(null);
    setCopied(false);
  };

  const closeResetDialog = () => {
    // Drop the password from memory as soon as the dialog closes
    setResetTarget(null);
    setResetPassword("");
    setResetDone(null);
    setCopied(false);
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setResetError(null);

    if (resetMode === "manual" && resetPassword.trim().length < 8) {
      setResetError("Password must be at least 8 characters");
      return;
    }

    setResetBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${resetTarget.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resetMode === "manual" ? { password: resetPassword.trim() } : {}),
      });
      const data = await res.json();
      if (!res.ok) {
        setResetError(data.error || "Failed to reset password");
        return;
      }
      setResetDone({ password: data.temporaryPassword ?? (resetMode === "manual" ? resetPassword.trim() : undefined) });
      setResetPassword("");
    } catch (err: any) {
      setResetError(err.message || "Failed to reset password");
    } finally {
      setResetBusy(false);
    }
  };

  const copyResetPassword = async () => {
    if (!resetDone?.password) return;
    try {
      await navigator.clipboard.writeText(resetDone.password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const openEditModal = (p: Profile) => {
    setEditingProfile(p);
    setFormData({
      email: p.email,
      password: "",
      full_name: p.full_name,
      phone: p.phone || "",
      role: p.role,
      country: p.country,
      countries: workCountries(p),
      is_active: p.is_active,
    });
  };

  const resetForm = () => {
    setFormData({
      email: "",
      password: "",
      full_name: "",
      phone: "",
      role: "salesperson",
      country: ownCountry,
      countries: [],
      is_active: true,
    });
  };

  const filteredProfiles = profiles.filter((p) => {
    const q = searchQuery.toLowerCase();
    return (
      p.full_name.toLowerCase().includes(q) ||
      p.email.toLowerCase().includes(q) ||
      p.role.toLowerCase().includes(q) ||
      p.country.toLowerCase().includes(q)
    );
  });

  if (authLoading) return null;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-slate-600 mb-2 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Settings
          </Link>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1B2A4A] tracking-tight flex items-center gap-3">
            <Users className="w-7 h-7 text-accent" />
            User Management
          </h1>
          <p className="text-sm font-semibold text-slate-500 mt-1">
            {canManageUsers
              ? "Provision ERP system accounts, assign roles, enforce country access, and reset credentials."
              : "Team members and their number series. Only an admin can add users or reset passwords."}
          </p>
        </div>

        {canManageUsers && (
        <button
          onClick={() => {
            resetForm();
            setIsCreateOpen(true);
          }}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#1B2A4A] text-white text-sm font-bold hover:bg-[#15223c] transition shadow-md shadow-[#1B2A4A]/10 cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          Create New User
        </button>
        )}
      </div>

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

      {/* Search Bar */}
      <div className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search users by name, email, role, or country..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/15"
          />
        </div>
        <button
          onClick={fetchUsers}
          className="p-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition"
          title="Refresh User List"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Users Data Table */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/80 text-[11px] uppercase tracking-wider font-bold text-slate-500">
                <th className="py-4 px-6">User Profile</th>
                <th className="py-4 px-6">Role</th>
                <th className="py-4 px-6">Assigned Country</th>
                <th className="py-4 px-6">Status</th>
                <th className="py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm font-semibold text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-slate-400">
                    Loading ERP user directory...
                  </td>
                </tr>
              ) : filteredProfiles.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-slate-400">
                    No users matching criteria found.
                  </td>
                </tr>
              ) : (
                filteredProfiles.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-[#1B2A4A]/10 text-[#1B2A4A] flex items-center justify-center font-bold text-sm">
                          {p.full_name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-slate-800">{p.full_name}</div>
                          <div className="text-xs text-slate-400 font-medium">{p.email}</div>
                          {p.phone && <div className="text-[11px] text-slate-400">{p.phone}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold ${
                        p.role === "super_admin"
                          ? "bg-purple-50 text-purple-700 border border-purple-200"
                          : p.role === "accountant"
                          ? "bg-blue-50 text-blue-700 border border-blue-200"
                          : "bg-slate-100 text-slate-700 border border-slate-200"
                      }`}>
                        <ShieldCheck className="w-3.5 h-3.5" />
                        {roleLabel(p.role, p.country)}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                        <Globe className="w-3.5 h-3.5" />
                        {workCountries(p).join(" + ")}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      {p.is_active ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-600">
                          <XCircle className="w-4 h-4 text-rose-500" />
                          Deactivated
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-right space-x-2">
                      {canManageUsers && (
                      <>
                      <button
                        onClick={() => openEditModal(p)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Edit
                      </button>
                      <button
                        onClick={() => openResetDialog(p)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
                        title={`Reset password for ${p.full_name}`}
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        Reset password
                      </button>
                      </>
                      )}
                      {p.role === "salesperson" && (
                        <button
                          onClick={() => setSeriesTarget(p)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
                          title={`Invoice and receipt numbers for ${p.full_name}`}
                        >
                          <Hash className="w-3.5 h-3.5" />
                          Number series
                        </button>
                      )}
                      {canManageUsers && p.is_active && (
                        <button
                          onClick={() => handleDeactivate(p)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-600 text-xs font-bold hover:bg-rose-100 transition cursor-pointer"
                        >
                          <UserX className="w-3.5 h-3.5" />
                          Deactivate
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit User Modal */}
      {(isCreateOpen || editingProfile) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-slate-200 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h2 className="text-xl font-extrabold text-[#1B2A4A]">
                {editingProfile ? `Edit User: ${editingProfile.full_name}` : "Create New ERP User"}
              </h2>
              <button
                onClick={() => {
                  setIsCreateOpen(false);
                  setEditingProfile(null);
                }}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={editingProfile ? handleUpdateSubmit : handleCreateSubmit} className="space-y-4">
              {!editingProfile && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="user@maatvet.com"
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-[#1B2A4A]"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="Dr. Ahmed Al-Mansoori"
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-[#1B2A4A]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Phone Number
                </label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+971 50 123 4567"
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-[#1B2A4A]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Role *
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-[#1B2A4A]"
                  >
                    <option value="salesperson">Salesperson</option>
                    <option value="accountant">Accountant</option>
                    <option value="super_admin">Admin ({ownCountry})</option>
                  </select>
                </div>

                <div>
                  <span className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Works in *
                  </span>
                  {formData.role === "accountant" ? (
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Countries">
                      {ALL_COUNTRIES.map((c) => {
                        const checked = c === ownCountry || formData.countries.includes(c);
                        return (
                          <label
                            key={c}
                            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold ${
                              checked ? "border-[#1B2A4A] bg-slate-50 text-slate-800" : "border-slate-200 text-slate-600"
                            } ${c === ownCountry ? "cursor-not-allowed" : "cursor-pointer"}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={c === ownCountry}
                              onChange={(e) => {
                                const others = formData.countries.filter((x) => x !== c && x !== ownCountry);
                                const next = e.target.checked ? [ownCountry, ...others, c] : others.length ? [ownCountry, ...others] : [];
                                setFormData({ ...formData, countries: next.length > 1 ? next : [] });
                              }}
                            />
                            {c}
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600">
                      {ownCountry}
                    </div>
                  )}
                </div>
              </div>

              {!editingProfile && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Password *
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="At least 8 characters"
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-[#1B2A4A]"
                  />
                </div>
              )}

              {editingProfile && (
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="is_active_check"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="rounded text-accent focus:ring-accent"
                  />
                  <label htmlFor="is_active_check" className="text-sm font-bold text-slate-700">
                    Account Active
                  </label>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateOpen(false);
                    setEditingProfile(null);
                  }}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#1B2A4A] text-white text-sm font-bold hover:bg-[#15223c] transition shadow-md cursor-pointer"
                >
                  {editingProfile ? "Save Changes" : "Create Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Dialog */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true" aria-labelledby="reset-title">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h2 id="reset-title" className="text-xl font-extrabold text-[#1B2A4A] flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-accent" />
                Reset password
              </h2>
              <button onClick={closeResetDialog} className="text-slate-400 hover:text-slate-600 font-bold" aria-label="Close">
                ✕
              </button>
            </div>

            <div className="text-sm">
              <div className="font-bold text-slate-800">{resetTarget.full_name}</div>
              <div className="text-xs text-slate-400 font-medium">{resetTarget.email}</div>
              {!resetTarget.is_active && (
                <div className="mt-2 text-xs font-semibold text-amber-700">
                  This account is deactivated. Reactivate it in Edit before the user can sign in.
                </div>
              )}
            </div>

            {resetDone ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2.5 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  <span className="font-semibold">Password changed. The old password no longer works.</span>
                </div>
                {resetDone.password && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      New password
                    </label>
                    <div className="flex gap-2">
                      <input
                        readOnly
                        value={resetDone.password}
                        onFocus={(e) => e.currentTarget.select()}
                        className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-semibold text-slate-800"
                      />
                      <button
                        type="button"
                        onClick={copyResetPassword}
                        className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50 transition cursor-pointer"
                      >
                        {copied ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <p className="mt-2 text-xs font-semibold text-slate-500">
                      Shown only now. Send it to {resetTarget.full_name} privately, not in a group chat.
                    </p>
                  </div>
                )}
                <div className="flex justify-end pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={closeResetDialog}
                    className="px-5 py-2.5 rounded-xl bg-[#1B2A4A] text-white text-sm font-bold hover:bg-[#15223c] transition shadow-md cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleResetSubmit} className="space-y-4">
                <fieldset className="space-y-2">
                  <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 cursor-pointer has-[:checked]:border-[#1B2A4A] has-[:checked]:bg-slate-50">
                    <input
                      type="radio"
                      name="reset-mode"
                      checked={resetMode === "generate"}
                      onChange={() => setResetMode("generate")}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block text-sm font-bold text-slate-800">Generate a temporary password</span>
                      <span className="block text-xs font-medium text-slate-500">A random 12-character password you can copy and share.</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 cursor-pointer has-[:checked]:border-[#1B2A4A] has-[:checked]:bg-slate-50">
                    <input
                      type="radio"
                      name="reset-mode"
                      checked={resetMode === "manual"}
                      onChange={() => setResetMode("manual")}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block text-sm font-bold text-slate-800">Set a password myself</span>
                      <span className="block text-xs font-medium text-slate-500">At least 8 characters.</span>
                    </span>
                  </label>
                </fieldset>

                {resetMode === "manual" && (
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    autoFocus
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    placeholder="New password"
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-[#1B2A4A]"
                  />
                )}

                {resetError && (
                  <div className="flex items-center gap-2.5 rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">
                    <AlertCircle className="h-5 w-5 shrink-0" />
                    <span className="font-semibold">{resetError}</span>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={closeResetDialog}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={resetBusy}
                    className="px-5 py-2.5 rounded-xl bg-[#1B2A4A] text-white text-sm font-bold hover:bg-[#15223c] transition shadow-md cursor-pointer disabled:opacity-60 disabled:cursor-wait"
                  >
                    {resetBusy ? "Resetting…" : "Reset password"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      {seriesTarget && (
        <NumberSeriesDialog
          userId={seriesTarget.id}
          userName={seriesTarget.full_name || ""}
          onClose={() => setSeriesTarget(null)}
        />
      )}
    </div>
  );
}
