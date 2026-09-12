"use client";

import { useCallback, useRef } from "react";

export function useSpaceSound() {
  const audioContextRef = useRef<AudioContext | null>(null);

  const playMessageChime = useCallback(() => {
    try {
      if (!audioContextRef.current) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        if (AudioCtx) {
          audioContextRef.current = new AudioCtx();
        }
      }

      const ctx = audioContextRef.current;
      if (!ctx || ctx.state === "suspended") {
        ctx?.resume().catch(() => undefined);
        return;
      }

      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.1, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
      gain.connect(ctx.destination);

      [660, 880].forEach((frequency, index) => {
        const oscillator = ctx.createOscillator();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, now + index * 0.08);
        oscillator.connect(gain);
        oscillator.start(now + index * 0.08);
        oscillator.stop(now + 0.22 + index * 0.08);
      });
    } catch {
      // Audio playback silently skipped if user hasn't interacted with page
    }
  }, []);

  return { playMessageChime };
}
