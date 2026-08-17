/**
 * MAATWEB Authentication System
 *
 * NOTE: Legacy custom session cookie authentication ("maat_session") has been removed.
 * All authentication, session state, and user identity across MAATWEB strictly
 * use Supabase Auth and @supabase/ssr.
 *
 * Server-side identity guard: @/lib/auth/guard -> requireAuth()
 * Client-side auth hook: @/hooks/useAuth -> useAuth()
 */

export {};
