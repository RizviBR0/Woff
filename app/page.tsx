import { Suspense } from "react";
import { CreateSpaceButton } from "@/components/create-space-button";
import { JoinRoomSection } from "@/components/join-room-section";
import { Logo } from "@/components/logo";
import { Navbar } from "@/components/navbar";
import { HomepageSections } from "@/components/homepage-sections";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background relative selection:bg-primary/30">
      <Navbar />

      {/* Hero Section */}
      <div className="relative min-h-[100dvh] flex items-center justify-center overflow-hidden px-4 pt-20">
        
        {/* Subtle grid pattern background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"></div>

        <div className="relative z-10 text-center space-y-12 w-full max-w-3xl mx-auto py-20">
          {/* Logo/Brand and Hero Copy */}
          <div className="space-y-8">
            <div className="flex justify-center flex-col items-center">
              <Logo width={280} height={84} className="w-56 h-auto sm:w-72" />
              <div className="mt-8 inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-background text-sm font-medium shadow-sm">
                <span className="flex h-2 w-2 rounded-full bg-green-500" />
                No sign-up required. Free forever.
              </div>
            </div>
            
            <div className="space-y-4">
              <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-foreground">
                Drop it here. <br />
                <span className="text-muted-foreground">
                  Share it anywhere.
                </span>
              </h1>
              <p className="text-lg sm:text-xl text-muted-foreground font-medium max-w-2xl mx-auto leading-relaxed">
                The fastest way to share notes, files, images, and code snippets in an instant workspace.
              </p>
            </div>
          </div>

          {/* CTA Section */}
          <div className="space-y-8 max-w-md mx-auto relative p-8 rounded-3xl bg-background border border-border shadow-md">
            <CreateSpaceButton />

            {/* Divider */}
            <div className="flex items-center gap-4 py-2">
              <div className="flex-1 h-px bg-border"></div>
              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-widest">
                or
              </span>
              <div className="flex-1 h-px bg-border"></div>
            </div>

            {/* Join Room Section */}
            <Suspense fallback={<div className="h-32 animate-pulse bg-muted rounded-xl" />}>
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
