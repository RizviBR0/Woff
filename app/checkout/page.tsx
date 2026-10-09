import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Check, CreditCard, LockKeyhole } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { BillingButton } from "@/components/account/billing-button";
import { getAccountContext } from "@/lib/account";
import { isVerifiedSender } from "@/lib/account-helpers";
import { needsBillingManagement } from "@/lib/billing/checkout-state";
import { getLaunchConfig } from "@/lib/launch-config";

export const metadata: Metadata = {
  title: "Woff Pro checkout",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const included = [
  ["A handoff with your name on it", "Choose your room name and URL, and add a welcome message."],
  ["Room for the next project too", "1 GiB across your rooms, with up to 10 active Pro handoffs."],
  ["Everything stays as you sent it", "Make a handoff read-only for recipients."],
  ["Less setup next time", "Save one room-settings template to reuse."],
];

export default async function CheckoutPage() {
  const { user, account, available } = await getAccountContext();
  const config = getLaunchConfig();
  const verified = isVerifiedSender(user);
  const managed = account && needsBillingManagement(account);
  const canCheckout = available && verified && account && !managed && config.checkoutEnabled;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="mx-auto max-w-6xl px-5 pb-20 pt-12 sm:px-8 sm:pt-16">
        <Link href="/pricing" className="mb-10 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All plans
        </Link>
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
          <section>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-600 dark:text-orange-400">Woff Pro / Monthly</p>
            <h1 className="mt-5 max-w-lg text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">Your work is ready.<br /><span className="text-muted-foreground">Give it a proper handoff.</span></h1>
            <p className="mt-6 max-w-md text-base leading-7 text-muted-foreground">A clear place for the final files, the important notes, and what your client needs next.</p>
            <div className="mt-9 divide-y border-y">
              {included.map(([title, description]) => (
                <div key={title} className="flex gap-4 py-5">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" />
                  <div><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p></div>
                </div>
              ))}
            </div>
            <p className="mt-5 text-xs leading-6 text-muted-foreground">Temporary sharing, with room to work: 1 GiB across your owned rooms, up to 10 active Pro rooms, and 50 MiB per file. Keep your own copies.</p>
          </section>

          <aside className="self-start overflow-hidden rounded-2xl border bg-card shadow-sm lg:mt-1">
            <div className="border-b bg-muted/30 px-6 py-5 sm:px-8">
              <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Your plan</h2><span className="rounded-md bg-orange-500/10 px-2.5 py-1 text-xs font-semibold text-orange-600 dark:text-orange-400">PRO</span></div>
            </div>
            <div className="px-6 py-7 sm:px-8">
              <div className="flex items-end gap-2"><span className="text-5xl font-semibold tracking-tight">${config.proPriceUsd}</span><span className="pb-1 text-sm text-muted-foreground">USD / month</span></div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">Renews monthly until you cancel. Applicable tax is calculated at checkout.</p>
              <div className="my-6 border-y py-4 text-sm">
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">Monthly subscription</span><span>${config.proPriceUsd}.00 USD</span></div>
                <div className="mt-3 flex justify-between gap-4"><span className="text-muted-foreground">Tax</span><span>Shown at checkout</span></div>
              </div>
              {verified && <p className="mb-5 break-words text-sm text-muted-foreground">For <span className="font-medium text-foreground">{user?.email}</span></p>}

              {!available ? (
                <div role="status" className="rounded-xl bg-muted p-4 text-sm leading-6">We couldn’t load your account. Refresh this page before continuing. <Link href="/contact" className="underline underline-offset-4">Get help</Link>.</div>
              ) : managed ? (
                <div className="space-y-4">
                  <p role="status" className="text-sm leading-6">{account.is_pro ? "Pro is already on this account. You don’t need another subscription." : "This account already has a subscription. Check its status or update your payment method in billing."}</p>
                  {account.subscription_id ? <BillingButton kind="portal" fullWidth /> : <Button asChild variant="primary" className="w-full"><Link href="/account">View account</Link></Button>}
                </div>
              ) : !config.checkoutEnabled ? (
                <div className="space-y-4">
                  <p role="status" className="rounded-xl bg-muted/70 p-4 text-sm leading-6">Pro checkout isn’t open yet. You can review what’s included here and keep using Free. No payment is taken.</p>
                  <Button asChild variant="outline" className="h-12 w-full rounded-xl"><Link href={verified ? "/dashboard" : "/"}>Continue with Free</Link></Button>
                </div>
              ) : !verified ? (
                <div className="space-y-4">
                  <p className="text-sm leading-6 text-muted-foreground">First, sign in so your subscription belongs to the right account.</p>
                  <Button asChild variant="primary" className="w-full"><Link href="/sign-in?next=%2Fcheckout">Sign in to continue</Link></Button>
                  <p className="text-center text-sm text-muted-foreground">New here? <Link href="/sign-up?next=%2Fcheckout" className="font-medium text-foreground underline underline-offset-4">Create an account</Link></p>
                </div>
              ) : canCheckout ? (
                <div className="space-y-4">
                  <BillingButton kind="checkout" label="Continue to checkout" fullWidth />
                  <p className="text-xs leading-5 text-muted-foreground">You’ll review the final amount and confirm payment with Lemon Squeezy. Continuing here does not charge you.</p>
                </div>
              ) : (
                <p role="status" className="text-sm leading-6 text-muted-foreground">Your account is still being prepared. <Link href="/account" className="underline underline-offset-4">Check your account</Link> before continuing.</p>
              )}
              <div className="mt-7 flex items-start gap-2.5 border-t pt-5 text-xs leading-5 text-muted-foreground"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" /><p>Payment details stay with Lemon Squeezy. Manage renewal and payment methods from your Woff account.</p></div>
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground"><Link href="/terms" className="underline underline-offset-4">Terms</Link><Link href="/privacy" className="underline underline-offset-4">Privacy</Link><Link href="/terms#billing" className="underline underline-offset-4">Refund policy</Link></div>
            </div>
            <div className="flex items-center gap-2 border-t bg-muted/20 px-6 py-4 text-xs text-muted-foreground sm:px-8"><CreditCard className="h-4 w-4" /> Cancel renewal in your billing portal.</div>
          </aside>
        </div>
      </main>
      <Footer />
    </div>
  );
}
