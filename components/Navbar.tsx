"use client";

import React from "react";
import { Menu, Bell, Search, ShieldCheck } from "lucide-react";
import { User } from "../types";
import { useLanguage } from "@/context/LanguageContext";

interface NavbarProps {
  user: User | null;
  onMenuToggle: () => void;
}

export function Navbar({ user, onMenuToggle }: NavbarProps) {
  const { language, setLanguage, t } = useLanguage();
  return (
    <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/80 px-6 backdrop-blur-md">
      <div className="flex items-center gap-4">
        {/* Toggle Button for Sidebar */}
        <button
          onClick={onMenuToggle}
          className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 lg:hidden focus:outline-none"
          aria-label="Toggle Sidebar"
        >
          <Menu className="h-6 h-6" />
        </button>
        {user && (
          <span className="text-base md:text-lg font-extrabold text-slate-800 tracking-tight">
            {language === "en" ? `Welcome, ${user.name}` : `مرحباً بك، ${user.name}`}
          </span>
        )}
      </div>

      {/* Right side items */}
      <div className="flex items-center gap-4">
        {/* Language Switcher */}
        <button
          onClick={() => setLanguage(language === "en" ? "ar" : "en")}
          className="rounded-xl px-3 py-1.5 text-xs font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition cursor-pointer"
        >
          {language === "en" ? "عربي" : "English"}
        </button>

        {/* Notification Icon */}
        <button className="relative rounded-xl p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition focus:outline-none">
          <Bell className="h-5 w-5" />
          <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" />
        </button>

        {/* Vertical Separator */}
        <div className="h-6 w-px bg-slate-200" />

        {/* User Card */}
        {user && (
          <div className="flex items-center gap-3">
            <div className="hidden text-right md:block">
              <span className="block text-sm font-bold text-slate-800 leading-tight">
                {user.name}
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-accent uppercase tracking-wider">
                <ShieldCheck className="w-3 h-3" />
                {user.role === "Salesman" ? t("bdmRole") : t("adminRole")}
              </span>
            </div>
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="h-10 w-10 rounded-2xl object-cover border border-slate-100 shadow-xs"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/15 text-accent font-bold text-sm">
                {user.name.charAt(0)}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
