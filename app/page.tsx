import { Navbar } from "@/components/navbar";
import HeroSection from "@/components/hero-section";
import { HomeClientShell } from "@/components/home-client-shell";
import { HomepageSections } from "@/components/homepage-sections";
import { Footer } from "@/components/footer";

export default function HomePage() {
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
    </div>
  );
}
