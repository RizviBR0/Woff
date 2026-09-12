import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Prefer the server-provided expiry timestamp. Legacy rows fall back to 48 hours.
export function getHoursUntilExpiry(value: string, isExpiryTimestamp = false): number {
  const date = new Date(value);
  const expiryDate = isExpiryTimestamp
    ? date
    : new Date(date.getTime() + 48 * 60 * 60 * 1000);
  const now = new Date();
  const diffMs = expiryDate.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (60 * 60 * 1000)));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function extractRoomCode(input: string): string {
  const value = input.trim();
  try {
    const url = new URL(value);
    const path = url.pathname || "/";
    if (path.startsWith("/r/")) {
      const code = path.slice(3).split("/")[0];
      return /^\d{4}$/.test(code) ? code : "";
    }
    const seg = path.split("/").filter(Boolean)[0];
    return /^\d{4}$/.test(seg || "") ? seg : "";
  } catch {
    if (value.includes("/r/")) {
      const code = value.split("/r/")[1].split("/")[0].split("?")[0];
      return /^\d{4}$/.test(code) ? code : "";
    }
    if (value.includes("/")) {
      const seg = value.split("/").filter(Boolean)[0];
      const code = (seg || "").split("?")[0];
      return /^\d{4}$/.test(code) ? code : "";
    }
    const digits = value.replace(/\D/g, "").slice(0, 4);
    return digits.length === 4 ? digits : "";
  }
}
