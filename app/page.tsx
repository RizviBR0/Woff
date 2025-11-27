import { Suspense } from "react";
import { CreateSpaceButton } from "@/components/create-space-button";
import { JoinRoomSection } from "@/components/join-room-section";
import { Logo } from "@/components/logo";
import { Navbar } from "@/components/navbar";
import { HomepageSections } from "@/components/homepage-sections";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero Section */}
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 px-4">
        <div className="text-center space-y-10 w-full max-w-xl mx-auto">
          {/* Logo/Brand */}
          <div className="space-y-6">
            <div className="flex justify-center">
              <Logo width={240} height={72} className="w-48 h-auto sm:w-60" />
            </div>
            <p className="text-xl text-muted-foreground font-medium">
              Simple shareable spaces
            </p>
          </div>

          {/* CTA Section */}
          <div className="space-y-8">
            <CreateSpaceButton />

            {/* Divider */}
            <div className="flex items-center gap-4 max-w-xs mx-auto">
              <div className="flex-1 h-px bg-border"></div>
              <span className="text-sm text-muted-foreground font-medium">
                or
              </span>
              <div className="flex-1 h-px bg-border"></div>
            </div>

            {/* Join Room Section */}
            <Suspense fallback={<div className="h-32" />}>
              <JoinRoomSection />
            </Suspense>
          </div>
        </div>
      </div>

      {/* Additional Sections */}
      <HomepageSections />
    </div>
  );
}
