import { randomInt } from "crypto";

/** Minimum length for any password set by an admin. */
export const MIN_PASSWORD_LENGTH = 8;

// No look-alike characters (0/O, 1/l/I) so a password read aloud or copied by hand survives.
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "#@$%&*!?";
const ALL = LOWER + UPPER + DIGITS + SYMBOLS;

const pick = (chars: string) => chars.charAt(randomInt(chars.length));

/**
 * Cryptographically random temporary password, 12 characters, always
 * containing a lower, an upper, a digit and a symbol. Server-side only.
 */
export function generateTemporaryPassword(length = 12): string {
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < length) chars.push(pick(ALL));

  // Fisher–Yates shuffle so the guaranteed characters aren't always first.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/** Returns an error message, or null when the password is acceptable. */
export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (password.length > 72) {
    return "Password must be 72 characters or fewer";
  }
  return null;
}
