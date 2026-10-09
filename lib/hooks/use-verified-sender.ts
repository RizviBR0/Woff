"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { isVerifiedSender } from "@/lib/account-helpers";

/** Presentation only; account routes still enforce authorization on the server. */
export function useVerifiedSender() {
  const [signedIn, setSignedIn] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    let active = true;
    let revision = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe = () => {};
    let checkSession = () => {};

    const checkVisibleSession = () => {
      if (document.visibilityState === "visible") checkSession();
    };

    // Keep the browser auth SDK out of the navbar's initial marketing bundle.
    void import("@/lib/supabase-browser")
      .then(({ supabaseBrowser }) => {
        if (!active) return;

        const verifySession = async () => {
          const currentRevision = ++revision;
          try {
            const { data, error } = await supabaseBrowser.auth.getUser();
            if (active && currentRevision === revision)
              setSignedIn(!error && isVerifiedSender(data.user));
          } catch {
            if (active && currentRevision === revision) setSignedIn(false);
          }
        };

        checkSession = () => {
          // Invalidate an older request before its response can restore a logout.
          revision += 1;
          clearTimeout(timer);
          // Supabase auth callbacks run under a lock; verify after they return.
          timer = setTimeout(() => {
            if (active) void verifySession();
          }, 0);
        };

        const { data } = supabaseBrowser.auth.onAuthStateChange(
          (event, session) => {
            if (!active) return;
            if (event === "SIGNED_OUT" || !isVerifiedSender(session?.user ?? null)) {
              revision += 1;
              clearTimeout(timer);
              setSignedIn(false);
            } else {
              checkSession();
            }
          },
        );
        unsubscribe = () => data.subscription.unsubscribe();
        checkSession();
      })
      .catch(() => {
        if (active) setSignedIn(false);
      });

    // Server actions change cookies without firing a browser auth event. Re-read
    // them on navigation and when returning to this tab (including the back cache).
    window.addEventListener("focus", checkVisibleSession);
    window.addEventListener("pageshow", checkVisibleSession);
    document.addEventListener("visibilitychange", checkVisibleSession);

    return () => {
      active = false;
      revision += 1;
      clearTimeout(timer);
      unsubscribe();
      window.removeEventListener("focus", checkVisibleSession);
      window.removeEventListener("pageshow", checkVisibleSession);
      document.removeEventListener("visibilitychange", checkVisibleSession);
    };
  }, [pathname]);

  return signedIn;
}
