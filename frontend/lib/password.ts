/**
 * What a new Kavuntra password must be, checked as it's typed. Passwords only ever go to Supabase Auth,
 * which checks them again (its own minimum and, when switched on, leaked-password protection); its
 * "weak_password" answer is shown as it says it.
 */
export const MIN_PASSWORD = 8;

// The most common passwords that pass the length and the letters-and-a-number rule anyway.
const COMMON = new Set([
  "password1",
  "password12",
  "password123",
  "passw0rd",
  "qwerty123",
  "qwertyuiop1",
  "abc12345",
  "abcd1234",
  "iloveyou1",
  "welcome1",
  "welcome123",
  "letmein1",
  "monkey123",
  "dragon123",
  "football1",
  "baseball1",
  "sunshine1",
  "princess1",
  "admin123",
  "kavuntra1",
  "talentbridge1",
]);

/** Why a new password can't be used, or null when it can. */
export function passwordProblem(password: string, email = ""): string | null {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) return "Use letters and at least one number.";
  if (COMMON.has(password.toLowerCase())) return "That password is too easy to guess. Choose another.";
  const name = email.split("@")[0]?.toLowerCase() ?? "";
  if (name.length >= 4 && password.toLowerCase().includes(name))
    return "Don't use your email address in your password.";
  return null;
}
