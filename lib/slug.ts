import { customAlphabet } from "nanoid";

// Simple alphabet without confusing characters for device IDs
const simpleAlphabet =
  "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";

// Numeric only for room codes (4 digits: 0000-9999)
const numericAlphabet = "0123456789";

// Create custom nanoid generators
const generateNumericCode = customAlphabet(numericAlphabet, 4);
const generateDeviceIdAlphabet = customAlphabet(simpleAlphabet, 21);

export function generateShortSlug(): string {
  return generateNumericCode(); // 4-digit numeric code (0000-9999)
}

export function generateDeviceId(): string {
  return generateDeviceIdAlphabet(); // 21 characters using simple alphabet
}
