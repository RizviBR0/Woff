import { customAlphabet } from "nanoid";

// Simple alphabet without confusing characters (no underscores, hyphens, or similar symbols)
// Excludes: 0, O, I, l, 1 to avoid confusion
const simpleAlphabet =
  "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";

// Create custom nanoid generators
const generateSimpleId = customAlphabet(simpleAlphabet, 6);
const generateDeviceIdAlphabet = customAlphabet(simpleAlphabet, 21);

export function generateShortSlug(): string {
  return generateSimpleId(); // 6 characters using simple alphabet
}

export function generateDeviceId(): string {
  return generateDeviceIdAlphabet(); // 21 characters using simple alphabet
}
