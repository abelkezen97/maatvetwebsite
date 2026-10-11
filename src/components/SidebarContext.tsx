"use client";

import React, { createContext, useContext } from "react";

interface SidebarContextType {
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
  toggleMobileMenu: () => void;
}

const SidebarContext = createContext<SidebarContextType>({
  isMobileOpen: false,
  setIsMobileOpen: () => {},
  toggleMobileMenu: () => {},
});

export function SidebarProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: SidebarContextType;
}) {
  return (
    <SidebarContext.Provider value={value}>
      {children}
    </SidebarContext.Provider>
  );
}

export const useSidebar = () => useContext(SidebarContext);
