/**
 * Normalize phone numbers to a consistent format
 * This is the SINGLE source of truth for phone normalization across the entire application
 *
 * @param phone - Phone number in any format (e.g., "123456789@s.whatsapp.net", "+1234567890", "123456789")
 * @returns Normalized phone number (digits only, no @ suffix)
 */
export function normalizePhoneNumber(phone: string | null | undefined): string {
  if (!phone) return "";

  // Remove @suffix (e.g., @s.whatsapp.net, @lid) and keep only the part before @
  const withoutSuffix = phone.split("@")[0];

  // Remove ALL non-numeric characters (spaces, dashes, parentheses, plus signs, etc.)
  const digitsOnly = withoutSuffix.replace(/\D/g, "");

  return digitsOnly;
}

/**
 * Check if two phone numbers are the same after normalization
 *
 * @param phone1 - First phone number
 * @param phone2 - Second phone number
 * @returns true if the normalized versions match
 */
export function arePhoneNumbersEqual(
  phone1: string | null | undefined,
  phone2: string | null | undefined
): boolean {
  const normalized1 = normalizePhoneNumber(phone1);
  const normalized2 = normalizePhoneNumber(phone2);

  // Both must be non-empty and equal
  if (!normalized1 || !normalized2) return false;

  return normalized1 === normalized2;
}
