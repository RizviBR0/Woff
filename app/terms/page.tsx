import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { FileText, AlertTriangle, CloudOff, Info } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Read our terms of service. Understand the acceptable use guidelines, disclaimer of backups, and moderation policies at Woff Space.",
  alternates: {
    canonical: "/terms",
  },
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground relative selection:bg-primary/30">
      {/* Background Grid */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.015)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:40px_40px]" />
      
      {/* Glows */}
      <div className="pointer-events-none absolute left-1/4 top-1/4 h-[350px] w-[350px] rounded-full bg-[#ff5a00]/5 dark:bg-[#ff5a00]/15 blur-[120px]" />
      <div className="pointer-events-none absolute right-0 bottom-1/4 h-[400px] w-[400px] rounded-full bg-[#ff5a00]/3 dark:bg-[#ff5a00]/10 blur-[130px]" />

      <Navbar />

      <main id="main-content" className="relative max-w-4xl mx-auto px-4 py-16 sm:px-6 lg:px-8 z-10">
        {/* Header */}
        <div className="text-center space-y-4 mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#ff5a00]/30 bg-[#ff5a00]/8 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#ff5a00]">
            <FileText className="w-3.5 h-3.5" />
            Terms of Use
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
            Terms of{" "}
            <span className="bg-gradient-to-r from-[#ff7d3b] via-[#ff5a00] to-[#ff3600] bg-clip-text text-transparent">
              Service
            </span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Last updated: October 4, 2026. Sharing, sender accounts, and the Pro pilot.
          </p>
        </div>

        {/* Content Card */}
        <div className="border border-zinc-200 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/50 backdrop-blur-xl rounded-[24px] p-6 sm:p-10 shadow-xl space-y-10">
          
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              By accessing and using Woff Space (the &quot;Service&quot;), you agree to be bound by these terms. If you do not agree to all terms, please do not use the website or its facilities.
            </p>
          </div>

          <hr className="border-zinc-200 dark:border-zinc-800" />

          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              2. Acceptable Use Guidelines
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Basic sharing does not require signup. Every participant must act responsibly. You agree not to use our Service to:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Upload, post, or share any content that is illegal, defamatory, harmful, or abusive.</li>
              <li>Share copyrighted files, images, or materials without proper authorization.</li>
              <li>Distribute malware, virus scripts, spyware, phishing links, or spam content.</li>
              <li>Disrupt, compromise, or overload our servers or database nodes.</li>
            </ul>
          </div>

          <hr className="border-zinc-200 dark:border-zinc-800" />
          <section id="billing" className="scroll-mt-24 space-y-4">
            <h2 className="text-2xl font-bold">3. Sender Accounts and Paid Plans</h2>
            <p className="leading-relaxed text-muted-foreground">Sender accounts are optional for basic sharing. Keep your sign-in email and recovery secrets under your control. A room recovery key restores room controls; it is not proof of ownership of a paid account or subscription.</p>
            <p className="leading-relaxed text-muted-foreground">The pricing page states whether Pro checkout is open. The monthly pilot has explicit file, storage, room, and availability limits. Review the price, tax, billing interval, and checkout provider before confirming a purchase. Recipients do not need a paid plan to open an authorized delivery.</p>
            <p className="leading-relaxed text-muted-foreground">When subscriptions are available, use Account to manage renewal and billing. Cancellation or a payment failure can change future plan access and room availability; review the effective date and room deadlines shown in your account. Download anything you need before those deadlines. Existing downloads cannot be recalled.</p>
            <p className="leading-relaxed text-muted-foreground">For an incorrect charge, refund request, or billing problem, contact support with the purchase reference. Requests are reviewed with the checkout provider and the circumstances of the purchase. This page does not promise automatic refunds or remove rights that apply to your purchase.</p>
          </section>

          <hr className="border-zinc-200 dark:border-zinc-800" />
          <section className="space-y-4">
            <h2 className="text-2xl font-bold">4. Availability and Support</h2>
            <p className="leading-relaxed text-muted-foreground">New sharing rooms have no expiry by default. Owners can set or remove a deadline, change the room code, or disable code access. Existing rooms keep their earlier deadline until the owner updates it. A deadline shown in the room governs availability. Keep a separate copy of important files; no-expiry rooms are not a guarantee of permanent storage. The service may restrict uploads when an allowance is exhausted or access when an invitation is expired or revoked.</p>
            <p className="leading-relaxed text-muted-foreground">Woff is operated from Bangladesh for an international audience. For sharing, account, abuse, or billing questions, use the contact page. Support and moderation response times vary; no response-time service level is included in the pilot.</p>
            <Link href="/contact" className="text-sm font-semibold text-orange-600 underline underline-offset-4 dark:text-orange-400">Contact support</Link>
          </section>

          <hr className="border-zinc-200 dark:border-zinc-800" />

          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <CloudOff className="w-5 h-5 text-orange-500" />
              5. No Permanent Backups
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Woff Space is for <strong>instant, temporary file sharing, not cloud storage</strong>. Keep your original files or download a copy of anything you need. It is not a permanent backup or vault storage service, including in Pro spaces.
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>We make no guarantees of permanent data availability, uptime, or safety.</li>
              <li>Inactive, expired spaces are automatically pruned from our servers regularly.</li>
              <li>You are solely responsible for keeping copies or offline backups of your notes and documents.</li>
            </ul>
          </div>

          <hr className="border-zinc-200 dark:border-zinc-800" />

          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Info className="w-5 h-5 text-orange-500" />
              6. Content Moderation and Removal
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              We reserve the right (but have no obligation) to remove any shared note, space, or file immediately if we receive a valid abuse report, copyright complaint, or detect activities violating security protocols. Suspicious or abusive IP ranges or device IDs may be blocked from creating spaces.
            </p>
          </div>

        </div>

      </main>

      <Footer />
    </div>
  );
}
