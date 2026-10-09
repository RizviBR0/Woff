"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { useCreateSpace } from "@/lib/hooks/use-create-space";
import { useVerifiedSender } from "@/lib/hooks/use-verified-sender";
import {
  Menu,
  X,
  BriefcaseBusiness,
  CreditCard,
  ExternalLink,
  HelpCircle,
  FileText,
  Loader2,
} from "lucide-react";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { Button } from "@/components/ui/button";

const navLinks = [
  {
    name: "For freelancers",
    href: "/for-freelancers",
    icon: BriefcaseBusiness,
    description: "Files and instructions in one handoff",
    external: false,
  },
  {
    name: "Pricing",
    href: "/pricing",
    icon: CreditCard,
    description: "Free sharing and the Pro pilot",
    external: false,
  },
  {
    name: "Help",
    href: "/help",
    icon: HelpCircle,
    description: "Sharing, recovery, and limits",
    external: false,
  },
  {
    name: "Blog",
    href: "/blog",
    icon: FileText,
    description: "Product updates, tips, and news",
    external: false,
  },
];

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [showCta, setShowCta] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const { isCreating, createAndNavigate: handleCreateSpace } = useCreateSpace();
  const signedIn = useVerifiedSender();
  const accountHref = signedIn ? "/dashboard" : "/sign-in";
  const accountLabel = signedIn ? "Dashboard" : "Sign in";

  useEffect(() => {
    const handleScroll = () => {
      setShowCta(window.scrollY > 300 && window.innerWidth >= 640);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);
    handleScroll();
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  return (
    <>
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-[#0a0a0a]/90 backdrop-blur-xl border-b border-zinc-200/60 dark:border-white/[0.06] navbar-orange-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 relative">
            {/* Logo */}
            <div className="flex-shrink-0 relative z-10">
              <Link href="/" className="flex items-center">
                <Logo width={120} height={36} className="w-24 h-auto" />
              </Link>
            </div>

            {/* Desktop Navigation — centered flat links */}
            <div className="hidden xl:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="flex items-center gap-1">
                {navLinks.map((link) => {
                  return (
                    <Link
                      key={link.name}
                      href={link.href}
                      target={link.external ? "_blank" : undefined}
                      rel={link.external ? "noopener noreferrer" : undefined}
                      className="group flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                    >
                      <span>{link.name}</span>
                      {link.external && (
                        <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Right side: CTA + Theme Toggle */}
            <div className="flex items-center gap-3 relative z-10 transition-all duration-300">
              <Link href={accountHref} className="hidden xl:inline-flex rounded-lg px-2 py-2 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">{accountLabel}</Link>
                {/* Theme toggle — Sun/Moon */}
              <AnimatedThemeToggler
                className="relative rounded-full w-9 h-9 flex items-center justify-center border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-300 dark:hover:border-white/20 transition-all duration-200"
                aria-label="Toggle theme"
              />

              {/* Mobile menu button */}
              <div className="xl:hidden">
                <Button
                  ref={menuButtonRef}
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsOpen(!isOpen)}
                  className="rounded-lg w-9 h-9 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                  aria-label="Toggle menu"
                  aria-expanded={isOpen}
                  aria-controls="woff-mobile-navigation"
                >
                  {isOpen ? (
                    <X className="h-4 w-4" />
                  ) : (
                    <Menu className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {/* Create Space CTA button — appears on scroll */}
              <button
                onClick={handleCreateSpace}
                disabled={isCreating || !showCta}
                tabIndex={showCta ? 0 : -1}
                aria-hidden={!showCta}
                className={`hidden sm:flex cta-button-glow h-10 text-sm font-semibold rounded-lg items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap transition-all duration-300 origin-right ${
                  showCta
                    ? "opacity-100 translate-x-0 scale-100 w-auto px-5 pointer-events-auto"
                    : "opacity-0 translate-x-4 scale-90 w-0 px-0 pointer-events-none overflow-hidden border-none"
                }`}
              >
                {isCreating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {isCreating ? "Creating..." : "Start sharing"}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isOpen && (
          <div id="woff-mobile-navigation" className="xl:hidden">
            <div className="px-2 pt-2 pb-3 space-y-1 bg-white/95 dark:bg-[#0a0a0a]/95 backdrop-blur-xl border-t border-zinc-200/60 dark:border-white/[0.06]">
              {navLinks.map((link) => {
                const IconComponent = link.icon;
                return (
                  <Link
                    key={link.name}
                    href={link.href}
                    target={link.external ? "_blank" : undefined}
                    rel={link.external ? "noopener noreferrer" : undefined}
                    onClick={() => setIsOpen(false)}
                    className="group flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 transition-all duration-200"
                  >
                    <IconComponent className="w-4 h-4" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span>{link.name}</span>
                        {link.external && (
                          <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                      </div>
                      <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-0.5">
                        {link.description}
                      </p>
                    </div>
                  </Link>
                );
              })}

              <Link href={accountHref} onClick={() => setIsOpen(false)} className="block rounded-xl px-3 py-3 text-sm font-semibold text-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:text-orange-400">{accountLabel}</Link>

              {/* Mobile CTA */}
              <div className="px-3 pt-2">
                <button
                  onClick={handleCreateSpace}
                  disabled={isCreating}
                  className="cta-button-glow w-full h-11 text-sm font-semibold rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isCreating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Start sharing"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Spacer to prevent content from hiding behind fixed navbar */}
      <div className="h-16" />
    </>
  );
}
