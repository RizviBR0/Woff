import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Heart, Shield, Zap, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About Us - Woff Space",
  description: "Learn more about Woff Space, our mission, and why we believe sharing text, files, and code snippets should be simple, private, and instant.",
  alternates: {
    canonical: "/about",
  },
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background text-foreground relative selection:bg-primary/30">
      {/* Background Grid */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.015)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:40px_40px]" />
      
      {/* Glows */}
      <div className="pointer-events-none absolute left-0 top-1/4 h-[350px] w-[350px] rounded-full bg-[#ff5a00]/5 dark:bg-[#ff5a00]/15 blur-[120px]" />
      <div className="pointer-events-none absolute right-1/4 bottom-1/4 h-[400px] w-[400px] rounded-full bg-[#ff5a00]/3 dark:bg-[#ff5a00]/10 blur-[130px]" />

      <Navbar />

      <main className="relative max-w-4xl mx-auto px-4 py-16 sm:px-6 lg:px-8 z-10">
        {/* Header */}
        <div className="text-center space-y-4 mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#ff5a00]/30 bg-[#ff5a00]/8 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#ff5a00]">
            <Sparkles className="w-3.5 h-3.5" />
            Our Story
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
            About{" "}
            <span className="bg-gradient-to-r from-[#ff7d3b] via-[#ff5a00] to-[#ff3600] bg-clip-text text-transparent">
              Woff Space
            </span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            We believe sharing shouldn&apos;t require an account, setup, or cookies. It should just work in one click.
          </p>
        </div>

        {/* Content Card */}
        <div className="border border-zinc-200 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/50 backdrop-blur-xl rounded-[24px] p-6 sm:p-10 shadow-xl space-y-12">
          {/* Mission */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">The Mission</h2>
            <p className="text-muted-foreground leading-relaxed">
              Woff Space was born out of frustration with modern web tools that lock simple utility behind login screens, tracking scripts, and subscription models. We wanted to build the absolute fastest way to drop text, transfer files, or paste code snippets between devices or with teammates—instantly.
            </p>
          </div>

          {/* Pillars Grid */}
          <div className="grid gap-6 sm:grid-cols-3 pt-4">
            <div className="space-y-3">
              <div className="h-10 w-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500">
                <Zap className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-lg">Zero Friction</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                No sign-ups, no verification emails, and no passwords. Create a secure space and share instantly.
              </p>
            </div>
            <div className="space-y-3">
              <div className="h-10 w-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500">
                <Shield className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-lg">Private By Default</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Your files and text are stored securely. We do not index your shared spaces, keeping them private.
              </p>
            </div>
            <div className="space-y-3">
              <div className="h-10 w-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500">
                <Heart className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-lg">Temporary Spaces</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Spaces expire and auto-clean after inactivity, meaning your temporary shares stay truly temporary.
              </p>
            </div>
          </div>

          <hr className="border-zinc-200 dark:border-zinc-800" />

          {/* How it works details */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">How We Handle Your Data</h2>
            <p className="text-muted-foreground leading-relaxed">
              Unlike traditional platforms that build permanent profiles, Woff Space treats your workspaces as transient. When you upload a file or write a note, it resides in highly secure object storage and real-time databases. Once a space is quiet and expires, the storage is cleaned up. We don&apos;t sell your data because we don&apos;t even collect your personal info.
            </p>
          </div>
        </div>

      </main>

      <Footer />
    </div>
  );
}
