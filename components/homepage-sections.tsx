"use client";

import dynamic from "next/dynamic";
import { ArrowRight, Mail, Heart, Calendar } from "lucide-react";
import { Footer } from "@/components/footer";

const BentoGrid = dynamic(() => import("@/components/bento-grid"), {
  ssr: true,
});

const TimelineDemo = dynamic(() => import("@/components/timeline-demo"), {
  ssr: false,
});

export function HomepageSections() {
  return (
    <>
      <BentoGrid />

      {/* How it Works Section - Timeline */}
      <section id="how-it-works" className="relative">
        <TimelineDemo />
      </section>

      {/* Contact Section */}
      <section
        id="contact"
        className="relative overflow-hidden bg-background px-4 py-20 text-foreground sm:px-6 lg:px-8 border-t border-border"
      >
        {/* Background Grid */}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.02)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:42px_42px]" />

        {/* Ambient background glows */}
        <div className="pointer-events-none absolute left-0 top-1/2 h-[420px] w-[420px] -translate-y-1/2 rounded-full bg-[#ff5a00]/8 dark:bg-[#ff5a00]/20 blur-[130px]" />
        <div className="pointer-events-none absolute right-10 top-10 h-[280px] w-[420px] rounded-full bg-[#ff5a00]/5 dark:bg-[#ff5a00]/10 blur-[120px]" />

        <div className="relative mx-auto max-w-7xl">
          {/* Main Card Container */}
          <div className="relative overflow-hidden rounded-[32px] border border-zinc-200 dark:border-[#ff5a00]/35 bg-white/70 dark:bg-[#111115]/70 px-6 py-16 text-center shadow-xl dark:shadow-[0_0_90px_rgba(255,90,0,0.12)] backdrop-blur-xl sm:px-10 sm:py-20 lg:py-24">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_left_center,rgba(255,90,0,0.1),transparent_28%),radial-gradient(circle_at_right_top,rgba(255,90,0,0.08),transparent_24%)]" />
            <div className="pointer-events-none absolute left-0 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ff5a00]/20 dark:bg-[#ff5a00] blur-2xl" />
            <div className="pointer-events-none absolute right-0 top-0 h-20 w-20 translate-x-1/3 -translate-y-1/3 rounded-full bg-[#ff5a00]/20 dark:bg-[#ff5a00] blur-2xl" />

            <div className="relative z-10">
              {/* Pulsing Pill Badge */}
              <div className="mx-auto mb-8 inline-flex items-center gap-2 rounded-full border border-[#ff5a00]/30 bg-[#ff5a00]/8 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-[#ff5a00] dark:text-[#ff7d3b] shadow-[0_0_15px_rgba(255,90,0,0.06)] dark:shadow-[0_0_20px_rgba(255,90,0,0.1)] backdrop-blur-md">
                <span className="h-1.5 w-1.5 rounded-full bg-[#ff5a00] animate-pulse" />
                Get In Touch
              </div>

              {/* Standardized Unified Heading */}
              <h2 className="mx-auto max-w-4xl text-3xl sm:text-5xl lg:text-6xl font-extrabold leading-tight tracking-[-0.04em] text-zinc-900 dark:text-white">
                We’d Love to{" "}
                <span className="bg-gradient-to-r from-[#ff7d3b] via-[#ff5a00] to-[#ff3600] bg-clip-text text-transparent">
                  Hear From You
                </span>
              </h2>

              <p className="mx-auto mt-6 max-w-3xl text-sm sm:text-base md:text-lg leading-relaxed text-zinc-500 dark:text-white/65">
                Have questions, feedback, or just want to say hi?
                <br className="hidden sm:block" />
                We’re always happy to connect with our community.
              </p>

              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <a
                  href="mailto:sabbirh9990@gmail.com"
                  className="group inline-flex w-full items-center justify-center gap-4 rounded-2xl bg-zinc-950 text-white dark:bg-white dark:text-black px-8 py-5 text-lg font-bold shadow-xl hover:bg-zinc-800 dark:hover:bg-zinc-100 hover:scale-[1.01] transition-transform duration-300 sm:w-auto"
                >
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M4 6h16v12H4V6Z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinejoin="round"
                    />
                    <path
                      d="m4 7 8 6 8-6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                  Contact Us
                  <svg
                    className="h-5 w-5 transition group-hover:translate-x-1"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <path
                      d="M5 12h14M13 6l6 6-6 6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </a>

                <a
                  href="https://calendly.com/rizvibr0/30min"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex w-full items-center justify-center gap-4 rounded-2xl border border-zinc-200 hover:border-zinc-400 dark:border-[#ff5a00]/35 bg-zinc-100/50 dark:bg-black/30 px-8 py-5 text-lg font-bold text-zinc-900 dark:text-white transition-all hover:bg-zinc-100 dark:hover:border-[#ff5a00] dark:hover:bg-[#ff5a00]/10 sm:w-auto"
                >
                  <svg
                    className="h-6 w-6 text-[#ff7a1a]"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <path
                      d="M7 3v4M17 3v4M4 9h16M5 5h14v15H5V5Z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Schedule a Meeting
                  <svg
                    className="h-5 w-5 transition group-hover:translate-x-1"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <path
                      d="M5 12h14M13 6l6 6-6 6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Unified Premium Footer */}
      <Footer />
    </>
  );
}
