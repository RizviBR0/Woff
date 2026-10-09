"use client";

export function PrivacySafeAnalytics(_props: { measurementId?: string }) {
  // Removing a tracking component on navigation does not unload its script or
  // history listeners. Keep third-party tracking off until public pages can be
  // isolated from invitation tokens, notes, account and billing routes.
  return null;
}
