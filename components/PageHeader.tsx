"use client";

import React from "react";
import Link from "next/link";
import { ChevronRight, ChevronLeft, Bell, Menu, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/context/LanguageContext";
import { useSidebar } from "@/components/SidebarContext";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  className?: string;
}

export function PageHeader({ 
  title, 
  description, 
  action, 
  actions,
  breadcrumbs,
  className = ""
}: PageHeaderProps) {
  const { user } = useAuth();
  const { language, setLanguage, t, translateBusinessText, isRtl } = useLanguage();
  const { toggleMobileMenu } = useSidebar();

  const translatedTitle = translateBusinessText(title);
  const translatedDesc = description ? translateBusinessText(description) : undefined;
  const actionContent = action || actions;

  return (
    <div 
      className={`w-full relative overflow-hidden bg-[#0B1528] text-white shadow-sm border-b border-slate-800/60 min-h-[160px] md:min-h-[190px] flex flex-col justify-between px-6 md:px-8 lg:px-10 py-5 md:py-6 ${className}`}
    >
      {/* Edge-to-Edge flowing background image starting at y=0 */}
      <div 
        className="absolute inset-0 bg-cover bg-right-top md:bg-center opacity-90 pointer-events-none transition-all duration-300"
        style={{ backgroundImage: "url('/header-bg.png')" }}
      />

      {/* Subtle navy gradient overlay for visual clarity and contrast */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#0B1528] via-[#0B1528]/85 to-transparent pointer-events-none" />

      {/* Z-10 HERO CONTENT WRAPPER */}
      <div className="relative z-10 w-full max-w-[1600px] mx-auto flex flex-col justify-between h-full gap-4">
        
        {/* TOP INTEGRATED ROW: USER CONTROLS DIRECTLY ON DARK NAVY HERO */}
        <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3">
          {/* Left: Mobile Drawer Button & Breadcrumbs / Welcome */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleMobileMenu}
              className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-xl p-2 text-white hover:bg-white/10 md:hidden focus:outline-none cursor-pointer border border-white/20 backdrop-blur-xs"
              aria-label="Toggle Sidebar"
            >
              <Menu className="h-6 w-6" />
            </button>

            {breadcrumbs && breadcrumbs.length > 0 ? (
              <nav className="flex items-center gap-1.5 text-xs font-semibold text-[#38BDF8] overflow-x-auto no-scrollbar">
                {breadcrumbs.map((crumb, idx) => {
                  const isLast = idx === breadcrumbs.length - 1;
                  const label = translateBusinessText(crumb.label);
                  return (
                    <React.Fragment key={idx}>
                      {idx > 0 && (
                        isRtl ? (
                          <ChevronLeft className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        )
                      )}
                      {crumb.href && !isLast ? (
                        <Link 
                          href={crumb.href} 
                          className="hover:text-white transition-colors duration-150 truncate max-w-[140px]"
                        >
                          {label}
                        </Link>
                      ) : (
                        <span className={isLast ? "text-slate-200 font-bold truncate max-w-[180px]" : "truncate max-w-[140px]"}>
                          {label}
                        </span>
                      )}
                    </React.Fragment>
                  );
                })}
              </nav>
            ) : user ? (
              <span className="text-xs md:text-sm font-bold text-slate-300 tracking-wide">
                {language === "en" ? `Welcome, ${user.name}` : `مرحباً بك، ${translateBusinessText(user.name)}`}
              </span>
            ) : null}
          </div>

          {/* Right: Language Switcher + Notification Icon + User Badge */}
          <div className="flex items-center gap-3 md:gap-4 shrink-0">
            {/* Arabic / English Language Toggle */}
            <button
              type="button"
              onClick={() => setLanguage(language === "en" ? "ar" : "en")}
              className="flex items-center justify-center min-h-[44px] px-3.5 py-2 text-xs md:text-sm font-bold border border-white/20 bg-white/10 hover:bg-white/20 text-white rounded-xl transition cursor-pointer backdrop-blur-xs"
            >
              {language === "en" ? "عربي" : "English"}
            </button>

            {/* Notification Icon */}
            <button 
              type="button"
              className="relative flex items-center justify-center min-h-[44px] min-w-[44px] rounded-xl p-2.5 text-slate-200 hover:bg-white/10 hover:text-white border border-white/20 bg-white/10 transition focus:outline-none cursor-pointer backdrop-blur-xs"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute top-2.5 right-2.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-[#0B1528]" />
            </button>

            {/* Vertical Separator */}
            <div className="h-6 w-px bg-white/20 hidden sm:block" />

            {/* User Profile Badge */}
            {user && (
              <div className="flex items-center gap-3">
                <div className={`hidden sm:block ${isRtl ? "text-left" : "text-right"}`}>
                  <span className="block text-sm font-bold text-white leading-tight">
                    {translateBusinessText(user.name)}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#38BDF8] uppercase tracking-wider">
                    <ShieldCheck className="w-3 h-3" />
                    {user.role === "salesperson" ? t("bdmRole") : user.role === "accountant" ? t("accountantRole") : t("adminRole")}
                  </span>
                </div>
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    className="h-10 w-10 rounded-2xl object-cover border border-white/20 shadow-xs shrink-0"
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#165B66] text-white font-black text-sm border border-white/20">
                    {user.name.charAt(0)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM ROW: PAGE TITLE, DESCRIPTION & ACTION BUTTONS */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 pt-1">
          <div className="space-y-1 max-w-3xl">
            {/* Page Title */}
            <h1 className="text-2xl sm:text-3xl lg:text-[34px] font-extrabold text-white tracking-tight leading-tight">
              {translatedTitle}
            </h1>

            {/* Description */}
            {translatedDesc && (
              <p className="text-xs sm:text-sm md:text-base text-slate-200/90 font-medium leading-relaxed max-w-2xl">
                {translatedDesc}
              </p>
            )}
          </div>

          {/* Page-Specific Action Buttons */}
          {actionContent && (
            <div className="flex flex-wrap items-center gap-3 shrink-0 relative z-20">
              {actionContent}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
