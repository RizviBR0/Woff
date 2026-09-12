import { Navbar } from "@/components/navbar";
import HeroSection from "@/components/hero-section";
import { HomeClientShell } from "@/components/home-client-shell";
import { HomepageSections } from "@/components/homepage-sections";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background relative selection:bg-primary/30">
      <Navbar />

      {/* Hero Section - rendered directly for instantaneous First Contentful Paint */}
      <HeroSection />

      {/* Additional Sections */}
      <HomepageSections />

      {/* Client-only drag-drop overlay and space creation loader */}
      <HomeClientShell />
    </div>
  );
}
