import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { getLaunchConfig } from "@/lib/launch-config";
import { PublicPageShell, publicCardClass, publicPrimaryLinkClass } from "@/components/public-page-shell";

export const metadata: Metadata = {
  title: "Pricing and Sharing Limits",
  description: "Free temporary sharing and the $8/month Pro sender pilot. Compare file limits, availability, room organization, and guest access.",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  const config = getLaunchConfig();
  const free = ["No signup for basic sharing or receiving", "Text, files, images, rich notes, and drawings", "50 MiB per file · 20 files per upload batch", "200 MiB per room · 400 MiB per signed-in owner", "Open room codes; choose an expiry when you want"];
  const pro = ["Custom room names and URLs, such as woff.space/your-name", "Welcome instructions and read-only client delivery", "One saved room-settings template for repeat handoffs", "1 GiB per sender · up to 10 active Pro rooms", "Same 50 MiB file and 20-file batch limits"];
  return <PublicPageShell eyebrow="Free sharing, optional sender tools" title="Simple plans for" accent="a clear handoff" description="Keep quick sharing free. The Pro pilot is for people who repeatedly deliver project files and instructions to clients.">
    {!config.checkoutEnabled ? <p className="mb-8 rounded-2xl border border-orange-500/25 bg-orange-500/5 p-5 text-center text-sm leading-7"><strong>Pro checkout is not open.</strong> The features and allowances below describe the planned monthly pilot. Try a free handoff or contact us to discuss your workflow.</p> : null}
    <div className="grid gap-6 md:grid-cols-2">
      {[{ name: "Free", amount: "$0", unit: "for basic sharing", items: free, href: "/new", action: "Start sharing free" }, { name: "Woff Pro", amount: `$${config.proPriceUsd}`, unit: "per month, applicable tax at checkout", items: pro, href: "/checkout", action: config.checkoutEnabled ? "Review Pro and continue" : "Explore Pro" }].map((plan) => <section key={plan.name} className={`${publicCardClass} flex flex-col ${plan.name === "Woff Pro" ? "border-orange-500/30 dark:border-orange-500/30" : ""}`}>
        <h2 className="text-xl font-bold">{plan.name}</h2><p className="mt-5 text-5xl font-extrabold tracking-tight">{plan.amount}</p><p className="mt-2 text-sm text-muted-foreground">{plan.unit}</p>
        <ul className="my-8 flex-1 space-y-4">{plan.items.map((item) => <li key={item} className="flex items-start gap-3 text-sm leading-6"><Check className="mt-1 h-4 w-4 shrink-0 text-orange-500" /><span>{item}</span></li>)}</ul>
        <Link href={plan.href} className={publicPrimaryLinkClass}>{plan.action}</Link>
      </section>)}
    </div>
    <section className={`${publicCardClass} mt-8 space-y-5`}>
      <h2 className="text-xl font-bold">What stays simple</h2>
      <p className="text-sm leading-7 text-muted-foreground">Recipients can open a shared delivery without subscribing. Room codes and optional deadlines are available on Free. Private notes belong to their creator. Keep your own copies; Woff is not a backup service. Stored files, note images, drawings, and pending uploads count toward the sender&apos;s allowance.</p>
      <p className="text-sm leading-7 text-muted-foreground">If checkout is available, review the amount and tax before confirming. Use your account&apos;s billing controls to manage renewal. Cancellation, payment failure, and expiry deadlines are explained in your account and the terms. No annual plan or lifetime storage is offered in this pilot.</p>
      <div className="flex flex-wrap gap-5 text-sm font-semibold text-orange-600 dark:text-orange-400"><Link href="/help">Sharing help</Link><Link href="/terms#billing">Billing terms</Link><Link href="/contact">Discuss the pilot</Link>{config.accountsEnabled ? <Link href="/sign-in">Sender sign-in</Link> : null}</div>
    </section>
  </PublicPageShell>;
}
