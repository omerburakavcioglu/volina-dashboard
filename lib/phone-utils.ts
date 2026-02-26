/**
 * Phone Number Utilities for E.164 Format
 * Handles normalization and validation for international outbound calls
 */

// Default caller ID from Netgsm (verified E.164 number)
export const DEFAULT_CALLER_ID = "+903129114094";

/**
 * Normalizes a phone number to E.164 format
 * @param input - Raw phone number input (can have spaces, parentheses, leading 0, 00, etc.)
 * @param defaultCountry - Default country code if not provided (default: "TR" for Turkey)
 * @returns Normalized E.164 phone number or null if invalid
 */
export function normalizeToE164(
  input: string,
  defaultCountry: string = "TR"
): string | null {
  if (!input || typeof input !== "string") {
    return null;
  }

  // Remove all whitespace, dashes, parentheses, and dots
  let cleaned = input.replace(/[\s\-\(\)\.]/g, "");

  // Remove leading + if present (we'll add it back)
  const hadPlus = cleaned.startsWith("+");
  if (hadPlus) {
    cleaned = cleaned.substring(1);
  }

  // Handle international prefix (00)
  if (cleaned.startsWith("00")) {
    cleaned = cleaned.substring(2);
    cleaned = "+" + cleaned;
  } else if (hadPlus) {
    cleaned = "+" + cleaned;
  } else {
    // No country code - apply default country logic
    if (defaultCountry === "TR") {
      // Turkish numbers: remove leading 0, add +90
      if (cleaned.startsWith("0")) {
        cleaned = cleaned.substring(1);
      }
      // Check if it already starts with 90 (without +)
      if (cleaned.startsWith("90") && cleaned.length >= 12) {
        cleaned = "+" + cleaned;
      } else if (cleaned.length === 10) {
        // 10 digits = Turkish local number
        cleaned = "+90" + cleaned;
      } else {
        // Assume it's already international without +
        cleaned = "+" + cleaned;
      }
    } else {
      // For other countries, assume input needs country code
      // This is a simplified approach - you may want to use a library like libphonenumber-js
      if (!cleaned.startsWith("+")) {
        return null; // Cannot determine country code
      }
    }
  }

  // Validate E.164 format: + followed by 1-15 digits
  const e164Regex = /^\+[1-9]\d{1,14}$/;
  if (!e164Regex.test(cleaned)) {
    return null;
  }

  return cleaned;
}

/**
 * Validates if a phone number is in E.164 format
 * @param phoneNumber - Phone number to validate
 * @returns true if valid E.164, false otherwise
 */
export function isValidE164(phoneNumber: string): boolean {
  if (!phoneNumber || typeof phoneNumber !== "string") {
    return false;
  }
  const e164Regex = /^\+[1-9]\d{1,14}$/;
  return e164Regex.test(phoneNumber);
}

/**
 * Validates and normalizes a phone number, throwing an error if invalid
 * @param input - Raw phone number input
 * @param defaultCountry - Default country code (default: "TR")
 * @returns Normalized E.164 phone number
 * @throws Error if phone number cannot be normalized
 */
export function validateAndNormalize(
  input: string,
  defaultCountry: string = "TR"
): string {
  const normalized = normalizeToE164(input, defaultCountry);
  if (!normalized) {
    throw new Error(
      `Invalid phone number format: "${input}". Phone numbers must be in E.164 format (e.g., +903129114094, +33123456789, +12125551234)`
    );
  }
  return normalized;
}
