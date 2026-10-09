import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/toaster";
import { Almarai, Inter } from "next/font/google";
import { PrivacySafeAnalytics } from "@/components/privacy-safe-analytics";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const almarai = Almarai({
  subsets: ["arabic"],
  weight: ["300", "400", "700", "800"],
  variable: "--font-almarai",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://woff.space";

export const metadata: Metadata = {
  title: {
    default: "Woff Space: Instant File Sharing Without Sign Up",
    template: "%s | Woff Space",
  },
  description:
    "Share files instantly between devices or with anyone using a link, room code, or QR code. No sign-up. Choose a time limit or leave the room open. Keep your own copy.",
  keywords: [
    "file sharing",
    "note sharing",
    "code sharing",
    "image sharing",
    "clipboard",
    "temporary file sharing",
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
    siteName: "Woff Space",
    title: "Woff Space: Instant File Sharing Without Sign Up",
    description:
      "Send files with a link, room code, or QR code. No sign-up required. Choose a time limit or leave the room open. Keep your own copy.",
    images: [
      {
        url: `${siteUrl}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "Woff Space",
      },
    ],
  },

  // Twitter Card
  twitter: {
    card: "summary_large_image",
    title: "Woff Space: Instant File Sharing Without Sign Up",
    description:
      "Send files with a link, room code, or QR code. No sign-up required. Choose a time limit or leave the room open. Keep your own copy.",
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
    canonical: "/",
  },

  // App-specific
  applicationName: "Woff Space",
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
  const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Woff",
    url: siteUrl,
    description:
      "Instant file sharing between devices or with other people. Share through a link, room code, or QR code, choose an optional time limit, and download a copy to keep.",
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Any",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
  };

  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${inter.variable} ${almarai.variable}`}
    >
      <head>
        {/* Preconnect to Supabase project (DNS + TCP + TLS early) */}
        {process.env.NEXT_PUBLIC_SUPABASE_URL && (
          <>
            <link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_SUPABASE_URL} />
            <link
              rel="preconnect"
              href={process.env.NEXT_PUBLIC_SUPABASE_URL}
              crossOrigin="anonymous"
            />
          </>
        )}
        {/* JSON-LD Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={`${inter.className} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster position="top-center" richColors />
        </ThemeProvider>
        <PrivacySafeAnalytics measurementId={GA_ID} />
      </body>
    </html>
  );
}
