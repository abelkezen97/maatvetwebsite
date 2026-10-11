"use client";

import React, { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { PageGuard } from "@/components/PageGuard";
import { SidebarProvider } from "@/components/SidebarContext";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/context/LanguageContext";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0B1528]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-white border-t-transparent" />
          <span className="text-sm font-semibold text-slate-300">{t("loadingSession")}</span>
        </div>
      </div>
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
      <div className="flex h-screen w-screen overflow-hidden bg-[#F8FAFC]">
        {/* Responsive Left Sidebar */}
        <Sidebar
          isOpen={isMobileOpen}
          isCollapsed={isCollapsed}
          onClose={() => setIsMobileOpen(false)}
          onCollapseToggle={() => setIsCollapsed(!isCollapsed)}
        />

        {/* Main Content Area starting directly at y=0 */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* View Scrollport - Starts at top of screen without white Navbar */}
          <main className="flex-1 overflow-y-auto bg-[#F8FAFC]">
            <PageGuard>
              {children}
            </PageGuard>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
