"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/logo";
import { createSpace } from "@/lib/actions";
import {
  Menu,
  X,
  Info,
  Mail,
  ExternalLink,
  HelpCircle,
  FileText,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";

const navLinks = [
  {
    name: "About",
    href: "#about",
    icon: Info,
    description: "Learn more about Woff",
    external: false,
  },
  {
    name: "How it Works",
    href: "#how-it-works",
    icon: HelpCircle,
    description: "Quick guide to get started",
    external: false,
  },
  {
    name: "Contact",
    href: "#contact",
    icon: Mail,
    description: "Get in touch with us",
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
  const [isCreating, setIsCreating] = useState(false);
  const [showCta, setShowCta] = useState(false);
  const router = useRouter();

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

  const handleCreateSpace = async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const space = await createSpace();
      router.push(`/${space.slug}`);
    } catch (err) {
      console.error("Failed to create space:", err);
      setIsCreating(false);
    }
  };

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
            <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="flex items-center gap-1">
                {navLinks.map((link) => {
                  return (
                    <Link
                      key={link.name}
                      href={link.href}
                      target={link.external ? "_blank" : undefined}
                      rel={link.external ? "noopener noreferrer" : undefined}
                      className="group flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors duration-200"
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
            <motion.div layout="position" className="flex items-center gap-3 relative z-10">
                {/* Theme toggle — Sun/Moon */}
              <AnimatedThemeToggler
                className="relative rounded-full w-9 h-9 flex items-center justify-center border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-300 dark:hover:border-white/20 transition-all duration-200"
                aria-label="Toggle theme"
              />

              {/* Mobile menu button */}
              <motion.div layout="position" className="md:hidden">
                <button
                  onClick={() => setIsOpen(!isOpen)}
                  className="rounded-lg w-9 h-9 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                  aria-label="Toggle menu"
                >
                  {isOpen ? (
                    <X className="h-4 w-4" />
                  ) : (
                    <Menu className="h-4 w-4" />
                  )}
                </button>
              </motion.div>

              {/* Create Space CTA button — appears on scroll */}
              <AnimatePresence mode="popLayout">
                {showCta && (
                  <motion.button
                    layout
                    initial={{ opacity: 0, scale: 0.8, x: 15 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.8, x: 15 }}
                    transition={{
                      type: "spring",
                      stiffness: 380,
                      damping: 30,
                    }}
                    onClick={handleCreateSpace}
                    disabled={isCreating}
                    className="hidden sm:flex cta-button-glow h-10 px-5 text-sm font-semibold rounded-lg items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {isCreating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <svg
                        viewBox="0 0 24 24"
                        height="16"
                        width="16"
                        xmlns="http://www.w3.org/2000/svg"
                        className="shrink-0"
                      >
                        <g fill="none">
                          <path
                            d="m12.594 23.258l-.012.002l-.071.035l-.02.004l-.014-.004l-.071-.036q-.016-.004-.024.006l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.016-.018m.264-.113l-.014.002l-.184.093l-.01.01l-.003.011l.018.43l.005.012l.008.008l.201.092q.019.005.029-.008l.004-.014l-.034-.614q-.005-.019-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.003-.011l.018-.43l-.003-.012l-.01-.01z"
                          />
                          <path
                            d="M9.107 5.448c.598-1.75 3.016-1.803 3.725-.159l.06.16l.807 2.36a4 4 0 0 0 2.276 2.411l.217.081l2.36.806c1.75.598 1.803 3.016.16 3.725l-.16.06l-2.36.807a4 4 0 0 0-2.412 2.276l-.081.216l-.806 2.361c-.598 1.75-3.016 1.803-3.724.16l-.062-.16l-.806-2.36a4 4 0 0 0-2.276-2.412l-.216-.081l-2.36-.806c-1.751-.598-1.804-3.016-.16-3.724l.16-.062l2.36-.806A4 4 0 0 0 8.22 8.025l.081-.216zM11 6.094l-.806 2.36a6 6 0 0 1-3.49 3.649l-.25.091l-2.36.806l2.36.806a6 6 0 0 1 3.649 3.49l.091.25l.806 2.36l.806-2.36a6 6 0 0 1 3.49-3.649l.25-.09l2.36-.807l-2.36-.806a6 6 0 0 1-3.649-3.49l-.09-.25zM19 2a1 1 0 0 1 .898.56l.048.117l.35 1.026l1.027.35a1 1 0 0 1 .118 1.845l-.118.048l-1.026.35l-.35 1.027a1 1 0 0 1-1.845.117l-.048-.117l-.35-1.026l-1.027-.35a1 1 0 0 1-.118-1.845l.118-.048l1.026-.35l.35-1.027A1 1 0 0 1 19 2"
                            fill="currentColor"
                          />
                        </g>
                      </svg>
                    )}
                    {isCreating ? "Creating..." : "Create Space"}
                    {!isCreating && <ArrowRight className="w-3.5 h-3.5" />}
                  </motion.button>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isOpen && (
          <div className="md:hidden">
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
                    <>
                      <svg
                        viewBox="0 0 24 24"
                        height="16"
                        width="16"
                        xmlns="http://www.w3.org/2000/svg"
                        className="shrink-0"
                      >
                        <g fill="none">
                          <path
                            d="M9.107 5.448c.598-1.75 3.016-1.803 3.725-.159l.06.16l.807 2.36a4 4 0 0 0 2.276 2.411l.217.081l2.36.806c1.75.598 1.803 3.016.16 3.725l-.16.06l-2.36.807a4 4 0 0 0-2.412 2.276l-.081.216l-.806 2.361c-.598 1.75-3.016 1.803-3.724.16l-.062-.16l-.806-2.36a4 4 0 0 0-2.276-2.412l-.216-.081l-2.36-.806c-1.751-.598-1.804-3.016-.16-3.724l.16-.062l2.36-.806A4 4 0 0 0 8.22 8.025l.081-.216zM11 6.094l-.806 2.36a6 6 0 0 1-3.49 3.649l-.25.091l-2.36.806l2.36.806a6 6 0 0 1 3.649 3.49l.091.25l.806 2.36l.806-2.36a6 6 0 0 1 3.49-3.649l.25-.09l2.36-.807l-2.36-.806a6 6 0 0 1-3.649-3.49l-.09-.25zM19 2a1 1 0 0 1 .898.56l.048.117l.35 1.026l1.027.35a1 1 0 0 1 .118 1.845l-.118.048l-1.026.35l-.35 1.027a1 1 0 0 1-1.845.117l-.048-.117l-.35-1.026l-1.027-.35a1 1 0 0 1-.118-1.845l.118-.048l1.026-.35l.35-1.027A1 1 0 0 1 19 2"
                            fill="currentColor"
                          />
                        </g>
                      </svg>
                      Create Space
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
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
