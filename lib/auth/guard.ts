import { cookies } from "next/headers";
import { createClient as createServerClient } from "@/utils/supabase/server";
import { Profile, UserRole } from "@/types";

export interface AuthContext {
  user: any;
  profile: Profile;
  supabase: any;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

/**
 * Standardized requireAuth helper for server API routes & actions.
 * Verifies Supabase Auth session, loads active profile from `profiles` table,
 * checks role restrictions, and returns { user, profile, supabase }.
 */
export async function requireAuth(allowedRoles?: UserRole[]): Promise<AuthContext> {
  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);

  // 1. Verify Supabase Session User
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new AuthError("Unauthorized: Session invalid or expired", 401);
  }

  // 2. Fetch Profile from `profiles` table
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    throw new AuthError("Forbidden: Profile not found", 403);
  }

  if (!profile.is_active) {
    throw new AuthError("Forbidden: User account is inactive", 403);
  }

  // 3. Role Validation
  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(profile.role as UserRole)) {
    throw new AuthError("Forbidden: Insufficient role permissions", 403);
  }

  return {
    user,
    profile: profile as Profile,
    supabase,
  };
}
