"use client";

import { useCallback, useEffect, useRef } from "react";

function scheduleChime(ctx: AudioContext) {
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
}

export function useSpaceSound() {
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    return () => {
      const ctx = audioContextRef.current;
      audioContextRef.current = null;
      if (ctx && ctx.state !== "closed") {
        void ctx.close().catch(() => undefined);
      }
    };
  }, []);

  const playMessageChime = useCallback(() => {
    try {
      if (!audioContextRef.current || audioContextRef.current.state === "closed") {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        if (AudioCtx) {
          audioContextRef.current = new AudioCtx();
        }
      }

      const ctx = audioContextRef.current;
      if (!ctx) return;

      if (ctx.state === "suspended") {
        void ctx
          .resume()
          .then(() => {
            if (audioContextRef.current === ctx && ctx.state === "running") {
              scheduleChime(ctx);
            }
          })
          .catch(() => undefined);
        return;
      }

      scheduleChime(ctx);
    } catch {
      // Audio playback silently skipped if user hasn't interacted with page
    }
  }, []);

  return { playMessageChime };
}
