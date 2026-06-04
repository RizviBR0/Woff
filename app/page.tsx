import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { Navbar } from "@/components/navbar";
import HeroSection from "@/components/hero-section";
import { HomeClientShell } from "@/components/home-client-shell";
import { HomepageSections } from "@/components/homepage-sections";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background relative selection:bg-primary/30">
      <Navbar />

      {/* Hero Section */}
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center bg-background">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
          </div>
        }
      >
        <HeroSection />
      </Suspense>

      {/* Additional Sections */}
      <HomepageSections />

      {/* Client-only drag-drop overlay and space creation loader */}
      <HomeClientShell />
    </div>
  );
}
