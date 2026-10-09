"use client";

import { useEffect, useState } from "react";

// Both SSR and the browser's hydration render start without a local clock.
export function useClientNow(refreshMilliseconds = 0): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    if (refreshMilliseconds <= 0) return;
    const interval = window.setInterval(() => setNow(Date.now()), refreshMilliseconds);
    return () => window.clearInterval(interval);
  }, [refreshMilliseconds]);
  return now;
}
