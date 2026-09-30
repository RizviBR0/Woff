import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Heart, EyeOff, Key, Database, Cookie } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EXTENSION_FILE_RETENTION, PRO_SPACE_RETENTION, STANDARD_SPACE_RETENTION } from "@/lib/sharing-copy";

export const metadata: Metadata = {
  title: "Privacy Policy - Woff Space",
  description: "Read our privacy policy to understand how Woff Space protects your data. We do not require accounts, logins, or capture personal identification info.",
  alternates: {
    canonical: "/privacy",
  },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground relative selection:bg-primary/30">
      {/* Background Grid */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.015)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:40px_40px]" />
      
      {/* Glows */}
      <div className="pointer-events-none absolute right-0 top-1/4 h-[350px] w-[350px] rounded-full bg-[#ff5a00]/5 dark:bg-[#ff5a00]/15 blur-[120px]" />
      <div className="pointer-events-none absolute left-1/4 bottom-1/4 h-[400px] w-[400px] rounded-full bg-[#ff5a00]/3 dark:bg-[#ff5a00]/10 blur-[130px]" />

      <Navbar />

      <main className="relative max-w-4xl mx-auto px-4 py-16 sm:px-6 lg:px-8 z-10">
        {/* Header */}
        <div className="text-center space-y-4 mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#ff5a00]/30 bg-[#ff5a00]/8 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#ff5a00]">
            <EyeOff className="w-3.5 h-3.5" />
            Your Privacy First
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
            Privacy{" "}
            <span className="bg-gradient-to-r from-[#ff7d3b] via-[#ff5a00] to-[#ff3600] bg-clip-text text-transparent">
              Policy
            </span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Last Updated: September 30, 2026. How we handle your temporary shares.
          </p>
        </div>

        {/* Content Card */}
        <div className="border border-zinc-200 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/50 backdrop-blur-xl rounded-[24px] p-6 sm:p-10 shadow-xl space-y-10">
          
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">1. No Accounts, No Identifiers</h2>
            <p className="text-muted-foreground leading-relaxed animate-fade-in">
              Woff Space does not ask for or collect your email address, phone number, real name, physical address, or password. Our system is built to facilitate completely anonymous, instant file and note sharing. 
            </p>
          </div>

          <hr className="border-zinc-200 dark:border-zinc-800" />

          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Database className="w-5 h-5 text-orange-500" />
              2. Data Storage and Retention
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              We hold your files, notes, and text to make sharing possible. Woff is for instant sharing, not permanent cloud storage or backups. Keep your own copy of anything you need.
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>
                <strong>Temporary Spaces:</strong> {STANDARD_SPACE_RETENTION} Adding content or editing a note starts a new 48-hour window. Expired spaces become unavailable to open and their content is scheduled for permanent deletion.
              </li>
              <li><strong>Extension Uploads:</strong> {EXTENSION_FILE_RETENTION}</li>
              <li><strong>Pro Spaces:</strong> {PRO_SPACE_RETENTION}</li>
              <li>
                <strong>Manual Deletion:</strong> A sender can delete only their own messages, while only the space creator can delete the complete space.
              </li>
            </ul>
          </div>

          <hr className="border-zinc-200 dark:border-zinc-800" />

          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Cookie className="w-5 h-5 text-orange-500" />
              3. Cookies and Browser Data
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              We do not use tracking or advertising cookies. We use only strictly functional browser identifiers:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>
                <strong>Anonymous session cookies:</strong> Supabase Authentication creates an invisible anonymous identity used by Row Level Security to enforce ownership. There is no profile, login form, email address, or password.
              </li>
              <li>
                <strong>Local Storage:</strong> Used for interface preferences, unsaved note recovery drafts, recent rooms, and locally saved room recovery keys.
              </li>
            </ul>
          </div>

          <hr className="border-zinc-200 dark:border-zinc-800" />

          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Key className="w-5 h-5 text-orange-500" />
              4. Analytics Services
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              On public marketing pages we may use Google Analytics (GA4) and Vercel Speed Insights for aggregate traffic and performance information. These tools are disabled entirely on room-code and note routes, so private room and note URLs are not sent to them.
            </p>
          </div>

        </div>

      </main>

      <Footer />
    </div>
  );
}
