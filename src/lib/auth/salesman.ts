/**
 * Deprecated legacy salesman utility module.
 * Supabase Auth (`requireAuth()`) is now the sole source of truth for authenticated user profiles.
 */

export function isValidUuid(val?: string | null): boolean {
  if (!val || typeof val !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
}
