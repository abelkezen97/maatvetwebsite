import Cookies from "js-cookie";
import { User, UserRole } from "@/types";
import { demoUsers } from "./mockData";

const SESSION_COOKIE_NAME = "maat_session";

export interface SessionData {
  user: User;
  token: string;
}

export function loginUser(email: string, role: UserRole): SessionData | null {
  const user = demoUsers.find(u => u.email === email && u.role === role);
  if (!user) return null;

  const session: SessionData = {
    user,
    token: `mock-jwt-${user.id}-${Date.now()}`
  };

  // Set cookie for 7 days
  Cookies.set(SESSION_COOKIE_NAME, JSON.stringify(session), { expires: 7 });
  return session;
}

export function logoutUser(): void {
  Cookies.remove(SESSION_COOKIE_NAME);
}

export function getClientSession(): SessionData | null {
  const cookieVal = Cookies.get(SESSION_COOKIE_NAME);
  if (!cookieVal) return null;

  try {
    return JSON.parse(cookieVal) as SessionData;
  } catch {
    return null;
  }
}

export function getServerSession(cookieHeader?: string): SessionData | null {
  if (!cookieHeader) return null;

  const nameEQ = `${SESSION_COOKIE_NAME}=`;
  const cookies = cookieHeader.split(";");

  for (let c of cookies) {
    c = c.trim();
    if (c.indexOf(nameEQ) === 0) {
      try {
        const decoded = decodeURIComponent(c.substring(nameEQ.length));
        return JSON.parse(decoded) as SessionData;
      } catch {
        return null;
      }
    }
  }
  return null;
}
