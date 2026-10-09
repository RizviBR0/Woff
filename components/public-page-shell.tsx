import type { ReactNode } from "react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PublicPageShell({
  eyebrow,
  title,
  accent,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  accent?: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-background text-foreground selection:bg-primary/30">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.015)_1px,transparent_1px)] bg-[size:40px_40px] dark:bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)]" />
      <div className="pointer-events-none absolute left-0 top-48 h-80 w-80 rounded-full bg-[#ff5a00]/5 blur-[120px] dark:bg-[#ff5a00]/15" />
      <Navbar />
      <main id="main-content" className="relative mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
        <header className="mx-auto mb-12 max-w-3xl space-y-5 text-center">
          <p className="inline-flex rounded-full border border-[#ff5a00]/30 bg-[#ff5a00]/8 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400">{eyebrow}</p>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
            {title}{accent ? <>{" "}<span className="bg-gradient-to-r from-[#ff7d3b] via-[#ff5a00] to-[#ff3600] bg-clip-text text-transparent">{accent}</span></> : null}
          </h1>
          <p className="text-lg leading-relaxed text-muted-foreground">{description}</p>
        </header>
        {children}
      </main>
      <Footer />
    </div>
  );
}

export const publicCardClass = "rounded-[24px] border border-zinc-200 bg-white/70 p-6 shadow-sm backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-900/50 sm:p-8";
export const publicPrimaryLinkClass = cn(buttonVariants({ variant: "primary", size: "primary" }));
