import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Heart, Shield, Zap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EXTENSION_FILE_RETENTION, PRO_SPACE_RETENTION, STANDARD_SPACE_RETENTION } from "@/lib/sharing-copy";

export const metadata: Metadata = {
  title: "About",
  description: "Woff Space is for instant file sharing between devices and people. Learn how sharing works and why you should keep your own copies.",
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

      <main id="main-content" className="relative max-w-4xl mx-auto px-4 py-16 sm:px-6 lg:px-8 z-10">
        {/* Header */}
        <div className="text-center space-y-4 mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#ff5a00]/30 bg-[#ff5a00]/8 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#ff5a00]">
            Our Story
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
            About{" "}
            <span className="bg-gradient-to-r from-[#ff7d3b] via-[#ff5a00] to-[#ff3600] bg-clip-text text-transparent">
              Woff Space
            </span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Woff is for instant file sharing, not cloud storage. Send files between devices or to other people, and keep your own copy of anything you need.
          </p>
        </div>

        {/* Content Card */}
        <div className="border border-zinc-200 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/50 backdrop-blur-xl rounded-[24px] p-6 sm:p-10 shadow-xl space-y-12">
          {/* Mission */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">The Mission</h2>
            <p className="text-muted-foreground leading-relaxed">
              Woff makes a small handoff easy: a file, its explanation, and a link the recipient can open. Basic sharing stays available without signup. Optional sender accounts and professional tools support people who repeatedly deliver work to clients.
            </p>
          </div>

          {/* Pillars Grid */}
          <div className="grid gap-6 sm:grid-cols-3 pt-4">
            <div className="rounded-[20px] border bg-card p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-orange-500/30 flex flex-col justify-between">
              <div>
                <div className="h-11 w-11 rounded-xl bg-orange-500/10 dark:bg-orange-500/15 border border-orange-500/20 flex items-center justify-center text-orange-500 mb-4">
                  <Zap className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-lg text-foreground">Zero Friction</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  Start basic sharing without signup. Recipients do not need an account. Sender accounts are optional for managing owned rooms across devices.
                </p>
              </div>
            </div>
            <div className="rounded-[20px] border bg-card p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-emerald-500/30 flex flex-col justify-between">
              <div>
                <div className="h-11 w-11 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center text-emerald-500 mb-4">
                  <Shield className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-lg text-foreground">Deliberate Sharing</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  Share a room code or invitation with intended recipients. Room and note pages are not indexed by search engines. Anyone with an enabled code or valid link can join.
                </p>
              </div>
            </div>
            <div className="rounded-[20px] border bg-card p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-sky-500/30 flex flex-col justify-between">
              <div>
                <div className="h-11 w-11 rounded-xl bg-sky-500/10 dark:bg-sky-500/15 border border-sky-500/20 flex items-center justify-center text-sky-500 mb-4">
                  <Heart className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-lg text-foreground">Your Time Limit</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  Leave a new room open without a deadline, or set one from Share. Keep your own copies of files and notes.
                </p>
              </div>
            </div>
          </div>

          <hr className="border-zinc-200 dark:border-zinc-800" />

          {/* How it works details */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">How We Handle Your Data</h2>
            <p className="text-muted-foreground leading-relaxed">
              Files and notes are held to make sharing possible. {STANDARD_SPACE_RETENTION} Once a space expires, it is no longer available to open and its content is scheduled for permanent deletion.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              {EXTENSION_FILE_RETENTION} {PRO_SPACE_RETENTION} Keep your originals or download a copy to your device.
            </p>
            <Link href="/help" className="inline-block text-sm font-medium text-orange-600 underline underline-offset-4 dark:text-orange-400">
              Read the sharing guide
            </Link>
          </div>
        </div>

      </main>

      <Footer />
    </div>
  );
}
