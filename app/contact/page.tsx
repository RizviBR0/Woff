import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Heart, Mail, Calendar, MessageSquare, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contact Us - Woff Space",
  description: "Get in touch with the Woff Space team. Send us feedback, submit abuse reports, or book a scheduling meeting directly.",
  alternates: {
    canonical: "/contact",
  },
};

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-background text-foreground relative selection:bg-primary/30">
      {/* Background Grid */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.015)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:40px_40px]" />
      
      {/* Glows */}
      <div className="pointer-events-none absolute right-1/4 top-1/4 h-[350px] w-[350px] rounded-full bg-[#ff5a00]/5 dark:bg-[#ff5a00]/15 blur-[120px]" />
      <div className="pointer-events-none absolute left-0 bottom-1/4 h-[400px] w-[400px] rounded-full bg-[#ff5a00]/3 dark:bg-[#ff5a00]/10 blur-[130px]" />

      <Navbar />

      <main className="relative max-w-4xl mx-auto px-4 py-16 sm:px-6 lg:px-8 z-10">
        {/* Header */}
        <div className="text-center space-y-4 mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#ff5a00]/30 bg-[#ff5a00]/8 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#ff5a00]">
            <MessageSquare className="w-3.5 h-3.5" />
            Support & Feedback
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
            Contact{" "}
            <span className="bg-gradient-to-r from-[#ff7d3b] via-[#ff5a00] to-[#ff3600] bg-clip-text text-transparent">
              Woff Team
            </span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Have questions or suggestion? We want to hear from you.
          </p>
        </div>

        {/* Option Grid */}
        <div className="grid gap-6 sm:grid-cols-2">
          {/* Email Support Card */}
          <div className="border border-zinc-200 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/50 backdrop-blur-xl rounded-[24px] p-8 shadow-xl flex flex-col justify-between h-64">
            <div className="space-y-3">
              <div className="h-10 w-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500">
                <Mail className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-xl">Direct Email</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Drop us a message for general queries, partnership ideas, feature suggestions, or tech support.
              </p>
            </div>
            <a
              href="mailto:sabbirh9990@gmail.com"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-black py-3 text-sm font-bold shadow-md hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors"
            >
              Email Us Directly
            </a>
          </div>

          {/* Booking Card */}
          <div className="border border-zinc-200 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/50 backdrop-blur-xl rounded-[24px] p-8 shadow-xl flex flex-col justify-between h-64">
            <div className="space-y-3">
              <div className="h-10 w-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500">
                <Calendar className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-xl">Schedule Meeting</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Book a quick 30-minute voice or video call on Calendly to chat with the founders.
              </p>
            </div>
            <a
              href="https://calendly.com/rizvibr0/30min"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-zinc-100/50 dark:bg-black/30 py-3 text-sm font-bold text-zinc-900 dark:text-white hover:bg-zinc-100 dark:hover:bg-[#ff5a00]/10 transition-colors"
            >
              Book Call on Calendly
            </a>
          </div>
        </div>

        {/* Abuse / Safety Banner */}
        <div className="mt-8 border border-red-500/20 bg-red-500/5 dark:bg-red-500/10 rounded-[24px] p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 shadow-sm">
          <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500 shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div className="flex-1 space-y-1">
            <h4 className="font-bold text-foreground">Report Abuse or Copyright Issues</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              If you found malicious, fraudulent, or copyrighted content hosted on our service, please contact us immediately at <a href="mailto:sabbirh9990@gmail.com" className="underline font-medium hover:text-red-500 transition-colors">sabbirh9990@gmail.com</a>. We will review and purge illegal content within 24 hours.
            </p>
          </div>
        </div>

      </main>

      <Footer />
    </div>
  );
}
