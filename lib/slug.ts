import { nanoid } from "nanoid";

export function generateShortSlug(): string {
  return nanoid(6); // 6 characters for short URLs
}

export function generateDeviceId(): string {
  return nanoid(21); // 21 characters for device IDs
}
