import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, HardDrive, Layers } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { BillingButton } from "@/components/account/billing-button";
import { getAccountContext } from "@/lib/account";
import { formatAccountBytes, isVerifiedSender } from "@/lib/account-helpers";
import { getLaunchConfig } from "@/lib/launch-config";
import { needsBillingManagement } from "@/lib/billing/checkout-state";
import { signOutAccount } from "@/app/sign-in/actions";
import { retryAccountMerge } from "./actions";

export const metadata: Metadata = {
  title: "Sender account",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const notices: Record<string, string> = {
  "checkout-return":
    "Payment confirmation can take a moment. Your account updates after the verified billing notification arrives. Refresh this page to check.",
  "rooms-recovered":
    "Your browser's owned rooms have been added to this account.",
  "merge-failed":
    "You are signed in, but this browser's rooms could not be transferred. Retry within 10 minutes. Keep the original room links and contact support if needed.",
  "merge-expired":
    "The room transfer proof expired. Use the original browser's guest session to request a fresh sign-in link.",
  "account-unavailable":
    "Your email is verified. Account setup is temporarily unavailable; try again later.",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const [params, context] = await Promise.all([
    searchParams,
    getAccountContext(),
  ]);
  const config = getLaunchConfig();
  const { account, user, available } = context;
  const verified = isVerifiedSender(user);
  const notice = params.notice && notices[params.notice];
  const paidThrough = account?.paid_through || account?.pro_until;
  const storageCharged =
    (account?.storage_used_bytes || 0) + (account?.reserved_bytes || 0);
  const date = (value: string) =>
    new Date(value).toLocaleDateString("en", {
      dateStyle: "medium",
      timeZone: "UTC",
    });
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="relative mx-auto max-w-4xl px-4 py-12 sm:py-16">
        <div className="pointer-events-none absolute left-1/3 top-0 h-72 w-72 rounded-full bg-[#ff5a00]/5 blur-[100px]" />
        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-5 mb-8">
            <div>
              <div className="flex items-center gap-2 text-sm text-[#ff5a00] mb-3">
                <ShieldCheck className="h-4 w-4" /> Sender account
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
                Your sharing workspace
              </h1>
              <p className="mt-3 text-muted-foreground">
                {verified
                  ? user?.email
                  : "Verify your email to keep your owned rooms together."}
              </p>
            </div>
            {verified && (
              <form action={signOutAccount}>
                <Button variant="outline" className="rounded-xl">
                  Sign out
                </Button>
              </form>
            )}
          </div>
          {notice && (
            <div
              role="status"
              className="mb-6 rounded-xl border border-orange-500/30 bg-orange-500/5 p-4 text-sm"
            >
              {notice}
              {params.notice === "merge-failed" && (
                <form action={retryAccountMerge} className="mt-3">
                  <Button variant="outline" size="sm">
                    Retry room transfer
                  </Button>
                </form>
              )}
            </div>
          )}
          {!available && (
            <p
              role="status"
              className="mb-6 rounded-xl border p-4 text-sm text-muted-foreground"
            >
              Sender accounts are being prepared. Your current sharing links
              continue to work.
            </p>
          )}
          {!verified ? (
            <div className="rounded-[22px] border bg-card p-7 sm:p-8 shadow-sm transition-all duration-200 hover:shadow-md">
              <div className="flex items-center gap-3.5 mb-4">
                <div className="w-11 h-11 rounded-xl bg-[#ff5a00]/10 dark:bg-[#ff5a00]/15 text-[#ff5a00] flex items-center justify-center shrink-0 border border-[#ff5a00]/20">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Save your sender account</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Attach guest rooms across devices</p>
                </div>
              </div>
              <p className="my-4 text-sm text-muted-foreground leading-relaxed">
                A verified email lets you recover rooms you own across devices.
                Sign in from the browser holding your guest rooms to attach them
                safely.
              </p>
              <Button asChild variant="primary" className="rounded-xl font-semibold">
                <Link href="/sign-up?next=/account">
                  Continue with email
                </Link>
              </Button>
            </div>
          ) : account ? (
            <>
              <div className="grid gap-5 sm:grid-cols-2">
                {/* Storage Card */}
                <div className="rounded-[22px] border bg-card p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-amber-500/30 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-xl bg-amber-500/10 dark:bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0 border border-amber-500/20">
                        <HardDrive className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-foreground">Storage Used</h3>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          Of {formatAccountBytes(account.storage_limit_bytes)} quota
                        </p>
                      </div>
                    </div>
                    <div className="mt-5 flex items-baseline justify-between gap-3">
                      <p className="text-2xl font-bold tracking-tight">
                        {formatAccountBytes(storageCharged)}
                      </p>
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                        {Math.min(100, Math.round((storageCharged / Math.max(1, account.storage_limit_bytes)) * 100))}% used
                      </span>
                    </div>
                    <div className="mt-4 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-[#ff5a00] rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(100, (storageCharged / Math.max(1, account.storage_limit_bytes)) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                  <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
                    Files, inline images and active uploads count toward
                    your allowance. Deleting rooms releases space immediately.
                  </p>
                </div>

                {/* Rooms Card */}
                <div className="rounded-[22px] border bg-card p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-[#ff5a00]/30 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-xl bg-[#ff5a00]/10 dark:bg-[#ff5a00]/15 text-[#ff5a00] flex items-center justify-center shrink-0 border border-[#ff5a00]/20">
                        <Layers className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-foreground">Active Pro Rooms</h3>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          Open client handoff spaces
                        </p>
                      </div>
                    </div>
                    <div className="mt-5 flex items-baseline justify-between gap-3">
                      <p className="text-2xl font-bold tracking-tight">
                        {account.active_room_count}
                      </p>
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#ff5a00]/10 text-[#ff5a00] border border-[#ff5a00]/20">
                        {account.active_room_limit > 0
                          ? `${account.active_room_limit} slots total`
                          : "Active"}
                      </span>
                    </div>
                  </div>
                  <div className="mt-5 pt-3 border-t">
                    <Button asChild variant="outline" className="w-full rounded-xl text-xs font-semibold h-9">
                      <Link href="/dashboard">
                        Open your rooms dashboard
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
              <section className="mt-6 rounded-[22px] border bg-card p-6 sm:p-7 shadow-sm transition-all duration-200 hover:shadow-md">
                <div className="flex flex-wrap items-start justify-between gap-5">
                  <div>
                    <h2 className="text-xl font-bold">
                      {account.is_pro ? "Woff Pro" : "Woff Free"}
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {account.is_pro
                        ? "Your monthly sender plan is available."
                        : "Instant sharing with a verified sender account."}
                    </p>
                    {paidThrough && (
                      <p className="mt-3 text-sm text-muted-foreground">
                        {account.status === "cancelled"
                          ? "Cancelled · Pro available through "
                          : "Paid access through "}
                        {date(paidThrough)}.
                      </p>
                    )}
                    {account.status === "past_due" && (
                      <p className="mt-3 text-sm text-orange-600 dark:text-orange-400">
                        Payment needs attention.
                        {account.grace_until &&
                          ` Grace ends ${date(account.grace_until)}.`}{" "}
                        Update your payment method to keep Pro.
                      </p>
                    )}
                    {account.status === "refunded" && (
                      <p className="mt-3 text-sm text-orange-600 dark:text-orange-400">
                        The latest payment was refunded. New Pro actions have
                        stopped. Manage billing to check the subscription and
                        future charges.
                      </p>
                    )}
                    <p className="mt-3 text-xs text-muted-foreground">
                      Cancelling preserves existing room deadlines. New Pro
                      rooms and settings stop when paid access and any grace
                      period end.
                    </p>
                  </div>
                  <div className="flex flex-col gap-3">
                    {account.subscription_id && <BillingButton kind="portal" />}
                    {!needsBillingManagement(account) && (
                      <Button asChild variant="primary">
                        <Link href="/checkout">{config.checkoutEnabled ? "Review Pro · $8/month" : "Explore Pro"}</Link>
                      </Button>
                    )}
                  </div>
                </div>
                {!needsBillingManagement(account) && (
                  <div className="mt-6 pt-5 border-t text-sm text-muted-foreground">
                    <p>
                      Pro includes named rooms, read-only handoffs, one reusable
                      settings template, optional room deadlines, 1 GiB across
                      owned rooms and up to 10 active handoff rooms. Files stay limited
                      to 50 MiB.
                    </p>
                    {!config.checkoutEnabled && (
                      <p className="mt-3">
                        The paid pilot is being prepared. Checkout opens after
                        payment, email and storage readiness checks.
                      </p>
                    )}
                    <p className="mt-3">
                      $8/month · monthly billing · taxes may apply · temporary
                      sharing, so keep your own copies.
                    </p>
                  </div>
                )}
              </section>
            </>
          ) : (
            verified && (
              <Button asChild variant="outline">
                <Link href="/dashboard">Try your room dashboard</Link>
              </Button>
            )
          )}
          <section className="mt-8 rounded-[24px] border bg-card/80 p-6 sm:p-8">
            <h2 className="text-lg font-semibold">Recovery, copies and deletion</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Recover a guest room with its recovery key. Download files and export
              notes before their deadline. Open an owned room from your dashboard
              to delete its content; storage cleanup follows automatically.
            </p>
            <div className="mt-4 flex flex-wrap gap-5 text-sm font-medium text-orange-600 dark:text-orange-400">
              <Link href="/recover">Recover room ownership</Link>
              <Link href="/help#export">Download and export help</Link>
              <Link href="/dashboard">Manage owned rooms</Link>
            </div>
            <p className="mt-4 text-xs leading-6 text-muted-foreground">
              For account-data or account-deletion requests, contact support from
              your verified email. Manage subscription renewal in the billing
              portal first. Deleting a room does not cancel a subscription.
            </p>
          </section>
          <p className="mt-8 text-sm text-muted-foreground">
            Need help with account recovery or billing?{" "}
            <Link href="/contact" className="underline underline-offset-4">
              Contact support
            </Link>
            .
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
