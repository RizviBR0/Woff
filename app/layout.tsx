import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Toaster } from "sonner";
import { Almarai } from "next/font/google";

const almarai = Almarai({
  subsets: ["arabic"],
  weight: ["300", "400", "700", "800"],
  variable: "--font-almarai",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://woff.space";

export const metadata: Metadata = {
  title: {
    default: "Woff – Simple Shareable Spaces",
    template: "%s | Woff",
  },
  description:
    "The fastest way to share notes, files, images, and code snippets. Create an instant workspace in seconds — no sign-up, no friction.",
  keywords: [
    "file sharing",
    "note sharing",
    "code sharing",
    "image sharing",
    "clipboard",
    "workspace",
    "collaboration",
    "paste",
    "drop",
    "woff",
    "instant share",
  ],
  authors: [{ name: "Woff Team" }],
  creator: "Woff",
  publisher: "Woff",
  metadataBase: new URL(siteUrl),

  // Favicons & Icons
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/site.webmanifest",

  // Open Graph
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "Woff",
    title: "Woff – Simple Shareable Spaces",
    description:
      "Create an instant workspace to share notes, files, images, and code snippets. No sign-up required.",
    images: [
      {
        url: `${siteUrl}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "Woff – Simple Shareable Spaces",
      },
    ],
  },

  // Twitter Card
  twitter: {
    card: "summary_large_image",
    title: "Woff – Simple Shareable Spaces",
    description:
      "Instantly share notes, files, images, and code snippets. No sign-up, no friction.",
    images: [`${siteUrl}/og-image.png`],
    creator: "@woffspace",
  },

  // Robots / Indexing
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },

  // Alternate / Canonical
  alternates: {
    canonical: siteUrl,
  },

  // App-specific
  applicationName: "Woff",
  category: "productivity",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const GA_ID = process.env.NEXT_PUBLIC_GA_ID || "G-Q401QHEJG3";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Woff",
    url: siteUrl,
    description:
      "The fastest way to share notes, files, images, and code snippets in instant workspaces.",
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Any",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
  };

  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth" className={almarai.variable}>
      <head>
        {/* Preconnect to Google Fonts CDN for faster font loading */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* DNS prefetch for Supabase API */}
        <link rel="dns-prefetch" href="https://supabase.co" />
        {/* DNS prefetch / preconnect for Picsum (blog cover images) */}
        <link rel="preconnect" href="https://picsum.photos" />
        <link rel="preconnect" href="https://fastly.picsum.photos" />
        {/* JSON-LD Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>
        {/* Google Analytics (GA4) — lazyOnload to avoid blocking FCP/LCP */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="lazyOnload"
        />
        <Script id="gtag-init" strategy="lazyOnload">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}');
          `}
        </Script>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster position="top-center" richColors />
        </ThemeProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
