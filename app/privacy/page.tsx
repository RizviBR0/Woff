import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { EyeOff, Key, Database, Cookie } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EXTENSION_FILE_RETENTION, PRO_SPACE_RETENTION, STANDARD_SPACE_RETENTION } from "@/lib/sharing-copy";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Woff handles temporary shared content, anonymous sessions, optional sender accounts, public-page measurement, and checkout data.",
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

      <main id="main-content" className="relative max-w-4xl mx-auto px-4 py-16 sm:px-6 lg:px-8 z-10">
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
            Last updated: October 4, 2026. How we handle shares and sender accounts.
          </p>
        </div>

        {/* Content Card */}
        <div className="border border-zinc-200 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/50 backdrop-blur-xl rounded-[24px] p-6 sm:p-10 shadow-xl space-y-10">
          
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">1. Sharing and Optional Accounts</h2>
            <p className="text-muted-foreground leading-relaxed animate-fade-in">
              Basic sharing and receiving do not require an email address or traditional account. Woff creates an anonymous session identifier to enforce room membership and ownership. If you choose a sender account, we use your email address for sign-in and account support. Files, notes, and any personal details you choose to put in them are stored to provide the sharing service.
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
                <strong>Room availability:</strong> {STANDARD_SPACE_RETENTION} A chosen deadline is fixed. Expired spaces become unavailable to open and their content is scheduled for permanent deletion.
              </li>
              <li><strong>Extension Uploads:</strong> {EXTENSION_FILE_RETENTION}</li>
              <li><strong>Pro Spaces:</strong> {PRO_SPACE_RETENTION}</li>
              <li>
                <strong>Manual Deletion:</strong> A sender can delete their own messages; the room owner can delete the complete room. Content is scheduled for storage cleanup. Deleted content is not recoverable through an ownership key.
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
              Functional browser data supports sign-in, ownership, preferences, and draft recovery. Public-page measurement, if enabled, is described separately below.
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>
                <strong>Session cookies:</strong> Supabase Authentication provides anonymous or signed-in sessions used to authorize access. Optional email sign-in links are separate from room invitation and recovery secrets.
              </li>
              <li>
                <strong>Local storage:</strong> Used for interface preferences, unsaved note recovery drafts, the last used room, and locally saved room recovery keys. Clearing browser data can remove these local copies.
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
              Third-party analytics scripts are disabled. Private first-party daily counters measure room and note creation, file publication, authorized share or download initiation, and upload failure. These counters contain no note contents, filenames, titles, invitation links, room codes, recovery keys or user identifiers. Service operations can retain session identifiers, timestamps, usage records and security or error records needed for access control, quotas, billing and support. A download initiation counter does not prove that a download completed.
            </p>
          </div>

          <hr className="border-zinc-200 dark:border-zinc-800" />
          <section className="space-y-4">
            <h2 className="text-2xl font-bold">5. Service and Checkout Providers</h2>
            <p className="leading-relaxed text-muted-foreground">Woff uses hosting, authentication, database, and file-storage providers to operate the service. Shared content is processed by these systems so recipients can view it; Woff does not provide end-to-end encryption. A private note restricts access to its creator, while shared room content is available to authorized participants.</p>
            <p className="leading-relaxed text-muted-foreground">If checkout is available, the provider identified at checkout handles payment details and may collect billing and tax information. Woff keeps purchase or subscription references and status to manage your plan. Full card numbers are handled by the checkout provider, not stored by Woff.</p>
          </section>

          <hr className="border-zinc-200 dark:border-zinc-800" />
          <section className="space-y-4">
            <h2 className="text-2xl font-bold">6. Access, Deletion, and Questions</h2>
            <p className="leading-relaxed text-muted-foreground">Use room controls to remove owned content. For account-data or deletion requests, contact us from the account email so ownership can be verified. Deleting a room does not withdraw copies recipients already downloaded. Billing records needed to handle transactions, disputes, or required record keeping may remain after content is removed.</p>
            <Link href="/contact" className="text-sm font-semibold text-orange-600 underline underline-offset-4 dark:text-orange-400">Contact us about your data</Link>
          </section>

        </div>

      </main>

      <Footer />
    </div>
  );
}
