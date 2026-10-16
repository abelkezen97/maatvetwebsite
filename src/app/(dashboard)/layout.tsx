"use client";

import React, { useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { PageGuard } from "@/components/PageGuard";
import { SidebarProvider } from "@/components/SidebarContext";
import { useAuth, COUNTRY_CHOSEN_KEY } from "@/hooks/useAuth";
import { CountryPicker } from "@/components/CountryPicker";
import { useLanguage } from "@/context/LanguageContext";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, loading, countries, switchCountry } = useAuth();
  const { t, setCurrencyCountry } = useLanguage();

  // Amounts across the app use the signed-in user's country currency (AED or OMR).
  useEffect(() => {
    setCurrencyCountry(profile?.country ?? null);
  }, [profile?.country, setCurrencyCountry]);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Users covering several countries pick one after signing in (once per session).
  const [countryChosen, setCountryChosen] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      setCountryChosen(!!sessionStorage.getItem(COUNTRY_CHOSEN_KEY));
    } catch {
      setCountryChosen(true); // no storage: don't block, the sidebar switcher still works
    }
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-dvh w-full items-center justify-center bg-[#0B1528]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-white border-t-transparent" />
          <span className="text-sm font-semibold text-slate-300">{t("loadingSession")}</span>
        </div>
      </div>
    );
  }

  if (profile && countries.length > 1 && countryChosen === false) {
    return (
      <CountryPicker
        name={profile.full_name || "there"}
        countries={countries}
        current={profile.country}
        onChoose={switchCountry}
      />
    );
  }

  return (
    <SidebarProvider
      value={{
        isMobileOpen,
        setIsMobileOpen,
        toggleMobileMenu: () => setIsMobileOpen((prev) => !prev),
      }}
    >
      {/* The page itself scrolls (not an inner box): iPad / iPhone Safari scroll
          smoothly, the toolbar can hide, and nothing sits under it. */}
      <div className="flex min-h-dvh w-full bg-[#F8FAFC]">
        {/* Responsive Left Sidebar */}
        <Sidebar
          isOpen={isMobileOpen}
          isCollapsed={isCollapsed}
          onClose={() => setIsMobileOpen(false)}
          onCollapseToggle={() => setIsCollapsed(!isCollapsed)}
        />

        {/* Main Content Area starting directly at y=0 */}
        <div className="flex flex-1 flex-col min-w-0 overflow-x-clip">
          <main className="flex-1 min-w-0 bg-[#F8FAFC]">
            <PageGuard>
              {children}
            </PageGuard>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
