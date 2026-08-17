"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Profile, User, UserRole, UserCountry } from "@/types";
import { Permissions } from "@/lib/auth/permissions";

export function useAuth() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function loadAuthUser() {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();

        if (authUser) {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", authUser.id)
            .maybeSingle();

          if (profileData && profileData.is_active) {
            setProfile(profileData as Profile);
            setUser({
              id: profileData.id,
              email: profileData.email,
              name: profileData.full_name || authUser.email || "User",
              role: profileData.role as UserRole,
              country: profileData.country as UserCountry,
            });
          } else {
            setProfile(null);
            setUser(null);
          }
        } else {
          setProfile(null);
          setUser(null);
        }
      } catch (err) {
        console.error("Error loading auth user profile:", err);
      } finally {
        setLoading(false);
      }
    }

    loadAuthUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .maybeSingle();

        if (profileData && profileData.is_active) {
          setProfile(profileData as Profile);
          setUser({
            id: profileData.id,
            email: profileData.email,
            name: profileData.full_name || session.user.email || "User",
            role: profileData.role as UserRole,
            country: profileData.country as UserCountry,
          });
        }
      } else {
        setProfile(null);
        setUser(null);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const loginWithPassword = async (email: string, password: string) => {
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      setLoading(false);
      let errorMsg = "Authentication failed";
      if (error) {
        const rawMsg = typeof error.message === "string" ? error.message.trim() : "";
        if (rawMsg && rawMsg !== "{}" && rawMsg !== "[object Object]") {
          errorMsg = rawMsg;
        } else if ((error as any).status === 500 || error.name === "AuthRetryableFetchError") {
          errorMsg = "Database error loading user";
        } else if ((error as any).status === 400 || (error as any).code === "invalid_credentials") {
          errorMsg = "Invalid login credentials";
        } else {
          errorMsg = "Authentication failed. Please check your credentials.";
        }
      }
      return { success: false, error: errorMsg };
    }

    if (typeof window !== "undefined") {
      window.location.href = "/dashboard";
    }
    return { success: true };
  };

  const logout = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setProfile(null);
    setUser(null);
    if (typeof window !== "undefined") {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (e) {
        // ignore
      }
    }
    router.replace("/login");
    router.refresh();
    setLoading(false);
  };

  const profileCtx = profile ? {
    id: profile.id,
    role: profile.role,
    country: profile.country,
    is_active: profile.is_active,
  } : null;

  return {
    user,
    profile,
    isAuthenticated: !!user,
    isSuperAdmin: profile?.role === "super_admin",
    isAdmin: profile?.role === "super_admin",
    isAccountant: profile?.role === "accountant",
    isSalesperson: profile?.role === "salesperson",
    isSalesman: profile?.role === "salesperson",
    permissions: profileCtx ? {
      canViewDashboard: Permissions.canViewDashboard(profileCtx),
      canManageUsers: Permissions.canManageUsers(profileCtx),
      canViewCustomers: Permissions.canViewCustomers(profileCtx),
      canCreateCustomer: Permissions.canCreateCustomer(profileCtx),
      canEditCustomer: Permissions.canEditCustomer(profileCtx),
      canViewQuotations: Permissions.canViewQuotations(profileCtx),
      canCreateQuotation: Permissions.canCreateQuotation(profileCtx),
      canEditQuotation: Permissions.canEditQuotation(profileCtx),
      canSoftDeleteQuotation: Permissions.canSoftDeleteQuotation(profileCtx),
      canViewInvoices: Permissions.canViewInvoices(profileCtx),
      canCreateInvoice: Permissions.canCreateInvoice(profileCtx),
      canEditInvoice: Permissions.canEditInvoice(profileCtx),
      canSoftDeleteInvoice: Permissions.canSoftDeleteInvoice(profileCtx),
      canViewReceipts: Permissions.canViewReceipts(profileCtx),
      canCreateReceipt: Permissions.canCreateReceipt(profileCtx),
      canEditReceipt: Permissions.canEditReceipt(profileCtx),
      canSoftDeleteReceipt: Permissions.canSoftDeleteReceipt(profileCtx),
      canViewProducts: Permissions.canViewProducts(profileCtx),
      canManageProducts: Permissions.canManageProducts(profileCtx),
      canViewSettings: Permissions.canViewSettings(profileCtx),
      canManageSettings: Permissions.canManageSettings(profileCtx),
      canViewCollectionLedger: Permissions.canViewCollectionLedger(profileCtx),
      canViewAllLedgers: Permissions.canViewAllLedgers(profileCtx),
      canViewExpenses: Permissions.canViewExpenses(profileCtx),
      canCreateExpense: Permissions.canCreateExpense(profileCtx),
      canApproveExpense: Permissions.canApproveExpense(profileCtx),
      canSoftDeleteExpense: Permissions.canSoftDeleteExpense(profileCtx),
      canViewHandovers: Permissions.canViewHandovers(profileCtx),
      canCreateHandover: Permissions.canCreateHandover(profileCtx),
      canApproveHandover: Permissions.canApproveHandover(profileCtx),
      canSetOpeningBalance: Permissions.canSetOpeningBalance(profileCtx),
    } : null,
    loading,
    loginWithPassword,
    logout,
  };
}
