"use client";

import Link from "next/link";
import { Heart, Info, Shield, FileText, Mail, FileSignature } from "lucide-react";
import { Logo } from "@/components/logo";

export function Footer() {
  return (
    <footer className="relative border-t border-zinc-200/80 dark:border-white/[0.06] bg-white/70 dark:bg-[#0a0a0a]/90 backdrop-blur-xl py-16 mt-20">
      {/* Background ambient glow */}
      <div className="pointer-events-none absolute right-1/4 bottom-0 h-[220px] w-[350px] rounded-full bg-[#ff5a00]/3 dark:bg-[#ff5a00]/8 blur-[90px]" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-6 mb-12">
          
          {/* Column 1: Logo & Info */}
          <div className="space-y-4">
            <Link href="/" className="inline-block">
              <Logo width={110} height={34} className="w-24 h-auto" />
            </Link>
            <p className="text-sm text-zinc-500 dark:text-zinc-400/80 max-w-sm leading-relaxed">
              Create a secure shareable space for notes, files, images, markdown, and code snippets in seconds. No login required.
            </p>
            <div className="text-xs text-zinc-400 dark:text-zinc-500">
              © 2026 Woff Space. Simple shareable spaces.
            </div>
          </div>

          {/* Column 2: Online Notepad Utilities */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-900 dark:text-white">
              Instant Tools
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/online-notepad" className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors duration-200">
                  Online Notepad
                </Link>
              </li>
              <li>
                <Link href="/share-notes-online-without-login" className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors duration-200">
                  Share Notes Without Login
                </Link>
              </li>
              <li>
                <Link href="/online-notepad-with-shareable-link" className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors duration-200">
                  Notepad with Share Link
                </Link>
              </li>
              <li>
                <Link href="/share-text-between-devices" className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors duration-200">
                  Share Text Between Devices
                </Link>
              </li>
              <li>
                <Link href="/share-code-snippets-online" className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors duration-200">
                  Share Code Snippets
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Brand & Trust */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-900 dark:text-white">
              Trust & Company
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/about" className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors duration-200">
                  <Info className="w-4 h-4 text-orange-500/80" />
                  About Us
                </Link>
              </li>
              <li>
                <Link href="/contact" className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors duration-200">
                  <Mail className="w-4 h-4 text-orange-500/80" />
                  Contact Us
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors duration-200">
                  <Shield className="w-4 h-4 text-orange-500/80" />
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors duration-200">
                  <FileText className="w-4 h-4 text-orange-500/80" />
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/blog" className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors duration-200">
                  <FileSignature className="w-4 h-4 text-orange-500/80" />
                  Woff Blog
                </Link>
              </li>
            </ul>
          </div>

        </div>

        <div className="border-t border-zinc-200/50 dark:border-white/[0.04] pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 font-medium">
            Made with
            <Heart className="w-4 h-4 text-red-500 fill-current animate-pulse" />
            by the Woff Space team
          </div>
          <div className="text-xs text-zinc-400 dark:text-zinc-500">
            Secure, temporary and frictionless.
          </div>
        </div>
      </div>
    </footer>
  );
}
