"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { SpeedInsights } from "@vercel/speed-insights/next";

export function PrivacySafeAnalytics({ measurementId }: { measurementId?: string }) {
  const pathname = usePathname();
  const isPrivateContent =
    /^\/\d{4}(?:\/|$)/.test(pathname) || pathname.startsWith("/n/");

  if (isPrivateContent) return null;

  return (
    <>
      {measurementId && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
            strategy="lazyOnload"
          />
          <Script id="gtag-init" strategy="lazyOnload">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${measurementId}', {
                page_location: window.location.origin + window.location.pathname
              });
            `}
          </Script>
        </>
      )}
      <SpeedInsights />
    </>
  );
}
