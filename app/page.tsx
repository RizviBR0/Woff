import type { Metadata } from "next";
import { Navbar } from "@/components/navbar";
import HeroSection from "@/components/hero-section";
import { HomeClientShell } from "@/components/home-client-shell";
import { HomepageSections } from "@/components/homepage-sections";
import { Footer } from "@/components/footer";
import { SITE_URL } from "@/lib/site-url";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
  openGraph: {
    url: SITE_URL,
  },
};

export default function HomePage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Woff",
    url: SITE_URL,
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
    <div className="min-h-screen bg-background relative selection:bg-primary/30">
      <Navbar />

      {/* Hero Section - rendered directly for instantaneous First Contentful Paint */}
      <main id="main-content">
        <HeroSection />

        {/* Additional Sections */}
        <HomepageSections />
      </main>
      <Footer />

      {/* Client-only drag-drop overlay and space creation loader */}
      <HomeClientShell />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
    </div>
  );
}
