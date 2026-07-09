"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getClientSession, loginUser, logoutUser, SessionData } from "@/lib/auth";
import { User, UserRole } from "@/types";

export function useAuth() {
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const activeSession = getClientSession();
    setSession(activeSession);
    setLoading(false);
  }, []);

  const login = async (email: string, role: UserRole) => {
    setLoading(true);
    const sessionData = loginUser(email, role);
    if (sessionData) {
      setSession(sessionData);
      router.replace("/dashboard");
      router.refresh();
      return true;
    }
    setLoading(false);
    return false;
  };

  const logout = () => {
    logoutUser();
    setSession(null);
    router.replace("/login");
    router.refresh();
  };

  return {
    user: session?.user || null,
    isAuthenticated: !!session,
    isAdmin: session?.user?.role === "Admin",
    isSalesman: session?.user?.role === "Salesman",
    loading,
    login,
    logout,
  };
}
