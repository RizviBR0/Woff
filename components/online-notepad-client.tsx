"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { createSpace } from "@/lib/actions";
import { rememberSpaceOwnership } from "@/lib/space-recovery";
import {
  Zap,
  Shield,
  RefreshCw,
  ArrowRight,
  Loader2,
  ChevronDown,
  ChevronUp,
  FileText,
  Link as LinkIcon,
  Laptop,
  Terminal,
  HelpCircle,
  Lock,
  Info,
} from "lucide-react";

export function OnlineNotepadClient() {
  const [isCreating, setIsCreating] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const router = useRouter();

  const handleCreateSpace = async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const space = await createSpace();
      rememberSpaceOwnership(space);
      router.push(`/${space.slug}`);
    } catch (err) {
      console.error("Failed to create space:", err);
      setIsCreating(false);
    }
  };

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const faqs = [
    {
      q: "Is Woff Space completely free?",
      a: "Yes, Woff Space is 100% free to use for sharing notes, code snippets, and files instantly. No credit card or subscription is required.",
    },
    {
      q: "Do I need to sign up or create an account?",
      a: "No registration is required. You can open Woff Space, create a notepad instantly, and share it with a link immediately.",
    },
    {
      q: "How long do my shared notes stay active?",
      a: "Shared spaces stay active as long as you use them. Inactive, expired spaces are automatically deleted after an extended period to ensure privacy.",
    },
    {
      q: "Can I share files and images too?",
      a: "Yes! In addition to a rich text editor, you can drag and drop images, PDFs, files, and drawings into your shared space instantly.",
    },
  ];

  const internalLinks = [
    {
      href: "/share-notes-online-without-login",
      label: "Share Notes Without Login",
    },
    {
      href: "/online-notepad-with-shareable-link",
      label: "Notepad with Share Link",
    },
    {
      href: "/share-text-between-devices",
      label: "Share Text Between Devices",
    },
    { href: "/share-code-snippets-online", label: "Share Code Snippets" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground relative selection:bg-primary/30 overflow-x-hidden">
      {/* Background grid design */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.015)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:40px_40px]" />

      {/* Ambient glows */}
      <div className="pointer-events-none absolute left-0 top-1/4 h-[350px] w-[350px] rounded-full bg-[#ff5a00]/5 dark:bg-[#ff5a00]/15 blur-[120px]" />
      <div className="pointer-events-none absolute right-1/4 bottom-1/4 h-[400px] w-[400px] rounded-full bg-[#ff5a00]/3 dark:bg-[#ff5a00]/10 blur-[130px]" />

      <Navbar />

      {/* Hero Section */}
      <section className="relative max-w-5xl mx-auto px-4 pt-16 pb-20 sm:px-6 lg:px-8 text-center z-10 space-y-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#ff5a00]/30 bg-[#ff5a00]/8 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-[#ff5a00]">
          <Zap className="w-3.5 h-3.5 animate-pulse" />
          Frictionless Web Notepad
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-tight max-w-4xl mx-auto">
          Online Notepad With{" "}
          <span className="bg-gradient-to-r from-[#ff7d3b] via-[#ff5a00] to-[#ff3600] bg-clip-text text-transparent">
            Shareable Link
          </span>
        </h1>

        <p className="text-lg sm:text-xl text-zinc-500 dark:text-zinc-400 max-w-2xl mx-auto leading-relaxed">
          Woff Space is the fastest way to write, save, and share text notes
          online.
          <br className="hidden sm:block" />
          Create a secure space in one click with zero sign-up
          required.
        </p>

        <div className="pt-4 flex justify-center">
          <button
            onClick={handleCreateSpace}
            disabled={isCreating}
            className="cta-button-glow inline-flex items-center gap-3 px-8 py-5 bg-zinc-950 dark:bg-white text-white dark:text-black font-extrabold text-lg rounded-2xl hover:scale-[1.02] active:scale-[0.98] disabled:opacity-75 transition-all duration-200 shadow-xl dark:shadow-[0_0_40px_rgba(255,90,0,0.15)]"
          >
            {isCreating ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin text-[#ff5a00]" />
                Creating Space...
              </>
            ) : (
              <>
                <FileText className="w-5.5 h-5.5 text-[#ff5a00]" />
                Create a Free Notepad
                <ArrowRight className="w-5 h-5 transition-transform hover:translate-x-1" />
              </>
            )}
          </button>
        </div>
      </section>

      {/* How it Works Section */}
      <section className="relative max-w-5xl mx-auto px-4 py-16 sm:px-6 lg:px-8 z-10 border-t border-zinc-200/50 dark:border-white/[0.04]">
        <div className="text-center space-y-3 mb-12">
          <h2 className="text-3xl font-bold tracking-tight">How It Works</h2>
          <p className="text-sm text-muted-foreground">
            Share notes in three simple steps.
          </p>
        </div>

        <div className="grid gap-8 sm:grid-cols-3">
          <div className="border border-zinc-200 dark:border-zinc-800/80 bg-white/50 dark:bg-zinc-950/40 p-6 rounded-2xl shadow-sm text-center space-y-3">
            <div className="h-12 w-12 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500 mx-auto font-bold text-lg">
              1
            </div>
            <h3 className="font-bold text-lg">Create notepad</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Click to launch a brand new empty room immediately.
            </p>
          </div>
          <div className="border border-zinc-200 dark:border-zinc-800/80 bg-white/50 dark:bg-zinc-950/40 p-6 rounded-2xl shadow-sm text-center space-y-3">
            <div className="h-12 w-12 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500 mx-auto font-bold text-lg">
              2
            </div>
            <h3 className="font-bold text-lg">Write your note</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Type, format notes, drop code, or upload files directly.
            </p>
          </div>
          <div className="border border-zinc-200 dark:border-zinc-800/80 bg-white/50 dark:bg-zinc-950/40 p-6 rounded-2xl shadow-sm text-center space-y-3">
            <div className="h-12 w-12 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500 mx-auto font-bold text-lg">
              3
            </div>
            <h3 className="font-bold text-lg">Share link</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Copy the dynamic URL and send it to anyone, anywhere.
            </p>
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="relative max-w-5xl mx-auto px-4 py-16 sm:px-6 lg:px-8 z-10 border-t border-zinc-200/50 dark:border-white/[0.04]">
        <div className="text-center space-y-3 mb-12">
          <h2 className="text-3xl font-bold tracking-tight">Best Use Cases</h2>
          <p className="text-sm text-muted-foreground">
            Perfect tool for fast and seamless sharing.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-4">
          <div className="border border-zinc-200 dark:border-zinc-800/80 bg-white/60 dark:bg-zinc-900/40 p-5 rounded-xl shadow-sm space-y-2.5">
            <Info className="w-5 h-5 text-orange-500" />
            <h4 className="font-bold text-base">Meeting Notes</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Share action items, decisions, and agendas with your remote team
              instantly.
            </p>
          </div>
          <div className="border border-zinc-200 dark:border-zinc-800/80 bg-white/60 dark:bg-zinc-900/40 p-5 rounded-xl shadow-sm space-y-2.5">
            <Terminal className="w-5 h-5 text-orange-500" />
            <h4 className="font-bold text-base">Code Snippets</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Send JSON, SQL, or component codes with teammates, styled with
              exact formatting.
            </p>
          </div>
          <div className="border border-zinc-200 dark:border-zinc-800/80 bg-white/60 dark:bg-zinc-900/40 p-5 rounded-xl shadow-sm space-y-2.5">
            <Laptop className="w-5 h-5 text-orange-500" />
            <h4 className="font-bold text-base">Transfer Text</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Move clipboard links, captions, and texts between your phone and
              laptop in seconds.
            </p>
          </div>
          <div className="border border-zinc-200 dark:border-zinc-800/80 bg-white/60 dark:bg-zinc-900/40 p-5 rounded-xl shadow-sm space-y-2.5">
            <FileText className="w-5 h-5 text-orange-500" />
            <h4 className="font-bold text-base">Study Topics</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Distribute exam notes, lists, reference sites, and PDFs with study
              groups quickly.
            </p>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative max-w-5xl mx-auto px-4 py-16 sm:px-6 lg:px-8 z-10 border-t border-zinc-200/50 dark:border-white/[0.04]">
        <div className="text-center space-y-3 mb-12">
          <h2 className="text-3xl font-bold tracking-tight">Key Features</h2>
          <p className="text-sm text-muted-foreground">
            Minimalist utilities built for absolute performance.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-3">
          <div className="flex gap-4">
            <div className="h-10 w-10 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-500 shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="font-bold text-base">No account signup</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Skip the verification steps. Open the page and share instantly.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="h-10 w-10 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-500 shrink-0">
              <LinkIcon className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="font-bold text-base">Shareable link</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Generates clean URL routes instantly that look great on any
                platform.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="h-10 w-10 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-500 shrink-0">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="font-bold text-base">Multi-device sync</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Open on phone, tablet or desktop. Updates instantly in
                real-time.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="relative max-w-3xl mx-auto px-4 py-16 sm:px-6 lg:px-8 z-10 border-t border-zinc-200/50 dark:border-white/[0.04]">
        <div className="text-center space-y-3 mb-10">
          <h2 className="text-3xl font-bold tracking-tight">
            Frequently Asked Questions
          </h2>
          <p className="text-sm text-muted-foreground">
            Answers to common questions about Woff Space.
          </p>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, idx) => (
            <div
              key={idx}
              className="border border-zinc-200 dark:border-zinc-800/80 bg-white/60 dark:bg-zinc-950/40 rounded-xl overflow-hidden transition-all duration-200"
            >
              <button
                onClick={() => toggleFaq(idx)}
                className="w-full px-6 py-4 flex items-center justify-between font-bold text-base text-left hover:bg-zinc-50 dark:hover:bg-zinc-900/30"
              >
                <span>{faq.q}</span>
                {openFaq === idx ? (
                  <ChevronUp className="w-4 h-4 text-orange-500" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-zinc-400" />
                )}
              </button>
              {openFaq === idx && (
                <div className="px-6 pb-5 text-sm text-muted-foreground border-t border-zinc-100 dark:border-zinc-900/60 pt-3 leading-relaxed">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Internal Links Grid */}
      <section className="relative max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8 z-10 border-t border-zinc-200/50 dark:border-white/[0.04]">
        <div className="text-center mb-6">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Related Sharing Utilities
          </h4>
        </div>
        <div className="flex flex-wrap justify-center gap-4">
          {internalLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="px-4 py-2 border border-zinc-200 dark:border-zinc-800 hover:border-orange-500/40 bg-white/50 dark:bg-zinc-950/40 rounded-xl text-xs font-semibold text-muted-foreground hover:text-[#ff5a00] hover:scale-[1.01] transition-all duration-200"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
}
