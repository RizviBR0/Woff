import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Prefer the server-provided expiry timestamp. Legacy rows fall back to 7 days.
export function getDaysUntilExpiry(value: string, isExpiryTimestamp = false): number {
  const date = new Date(value);
  const expiryDate = isExpiryTimestamp
    ? date
    : new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000);
  const now = new Date();
  const diffMs = expiryDate.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
}
