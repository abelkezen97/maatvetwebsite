"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  LayoutDashboard, 
  Package, 
  FilePlus2, 
  FileText, 
  Users, 
  Settings, 
  LogOut, 
  ChevronLeft, 
  ChevronRight,
  X 
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/context/LanguageContext";

interface SidebarProps {
  isOpen: boolean;       // For mobile drawer toggle
  isCollapsed: boolean;  // For tablet toggle
  onClose: () => void;   // Mobile close
  onCollapseToggle: () => void; // Tablet toggle
}

export function Sidebar({ isOpen, isCollapsed, onClose, onCollapseToggle }: SidebarProps) {
  const pathname = usePathname();
  const { logout } = useAuth();
  const { t, isRtl } = useLanguage();

  const menuItems = [
    { name: t("dashboard"), href: "/dashboard", icon: LayoutDashboard },
    { name: t("products"), href: "/products", icon: Package },
    { name: t("newQuote"), href: "/quotes/new", icon: FilePlus2 },
    { name: t("quotes"), href: "/quotes", icon: FileText },
    { name: t("invoices"), href: "/invoices", icon: FileText },
    { name: t("customers"), href: "/customers", icon: Users },
    { name: t("settings"), href: "/settings", icon: Settings },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#1B2A4A] text-white">
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-4 border-b border-white/10 h-20 ${isCollapsed ? "justify-center" : ""}`}>
        {isCollapsed ? (
          <button
            onClick={onCollapseToggle}
            className="flex items-center justify-center w-12 h-12 rounded-xl bg-white/5 hover:bg-white/10 transition duration-150 focus:outline-none"
            title="Expand Sidebar"
          >
            <img src="/inverted.svg" alt="MAAT Logo" className="w-8 h-8 object-contain" />
          </button>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="p-1 bg-white/5 rounded-xl">
                <img src="/inverted.svg" alt="MAAT Logo" className="w-9 h-9 object-contain" />
              </div>
              <div className="flex flex-col">
                <span className="font-extrabold text-base tracking-wider text-white leading-none">
                  {t("maatGroup")}
                </span>
                <span className="text-[9px] uppercase font-bold tracking-widest text-[#61989B] mt-1.5 leading-none">
                  {t("vetMedicine")}
                </span>
              </div>
            </div>
            
            {/* Tablet Collapse Toggle Button */}
            <button
              onClick={onCollapseToggle}
              className="hidden md:flex items-center justify-center p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition focus:outline-none"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </>
        )}
        
        {/* Mobile Close Button */}
        {isOpen && (
          <button
            onClick={onClose}
            className="md:hidden flex items-center justify-center p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition focus:outline-none"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation items */}
      <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
        {menuItems.map((item) => {
          const isActive = 
            pathname === item.href || 
            (item.href !== "/dashboard" && pathname.startsWith(item.href) && !(item.href === "/quotes" && pathname.startsWith("/quotes/new")) && !(item.href === "/invoices" && pathname.startsWith("/invoices/new")));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-4 px-4 py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 group ${
                isActive
                  ? "bg-[#61989B] text-white shadow-lg shadow-[#61989B]/15"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon className="w-5.5 h-5.5 stroke-[2] shrink-0" />
              {!isCollapsed && <span className="truncate">{item.name}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer logout */}
      <div className="p-4 border-t border-white/10">
        <button
          onClick={() => logout()}
          className="flex w-full items-center gap-4 px-4 py-3.5 rounded-xl font-semibold text-sm text-rose-300 hover:bg-rose-950/30 hover:text-rose-200 transition-colors duration-200"
        >
          <LogOut className="w-5.5 h-5.5 stroke-[2] shrink-0" />
          {!isCollapsed && <span>{t("logout")}</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Drawer (Under 768px) */}
      <div className="md:hidden">
        <AnimatePresence>
          {isOpen && (
            <>
              {/* Overlay */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.5 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="fixed inset-0 z-50 bg-black"
              />
              {/* Drawer Container */}
              <motion.div
                initial={{ x: isRtl ? "100%" : "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: isRtl ? "100%" : "-100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className={`fixed inset-y-0 ${isRtl ? "right-0" : "left-0"} z-50 w-72 max-w-xs shadow-2xl h-full`}
              >
                {sidebarContent}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Tablet / Desktop Sidebar (Over 768px) */}
      <div
        className={`hidden md:block h-screen shrink-0 transition-all duration-300 border-r border-slate-200 bg-[#1B2A4A] ${
          isCollapsed ? "w-20" : "w-64"
        }`}
      >
        {sidebarContent}
      </div>
    </>
  );
}
