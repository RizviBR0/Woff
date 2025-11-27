import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Get days until space expires (2 days of inactivity)
export function getDaysUntilExpiry(lastActivityAt: string): number {
  const lastActivity = new Date(lastActivityAt);
  const expiryDate = new Date(lastActivity.getTime() + 2 * 24 * 60 * 60 * 1000);
  const now = new Date();
  const diffMs = expiryDate.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
}
