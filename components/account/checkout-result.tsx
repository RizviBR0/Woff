"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, CircleHelp, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BillingButton } from "@/components/account/billing-button";
import type { CheckoutStatus } from "@/lib/billing/checkout-state";
import { pollCheckoutStatus } from "@/lib/billing/poll-checkout-status";

export function CheckoutResult({ initialStatus }: { initialStatus: CheckoutStatus }) {
  const [status, setStatus] = useState(initialStatus);
  const [checking, setChecking] = useState(initialStatus.state === "processing");
  const [error, setError] = useState("");
  const [signedOut, setSignedOut] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (initialStatus.state !== "processing" && attempt === 0) return;
    setChecking(true);
    setError("");
    setSignedOut(false);
    return pollCheckoutStatus({
      onStatus: setStatus,
      onFinish: (result) => {
        setChecking(false);
        if (result.kind === "signed-out") setSignedOut(true);
        if (result.kind === "error") setError(result.message);
      },
    });
  }, [attempt, initialStatus.state]);

  const active = status.state === "active";
  const inactive = status.state === "inactive";
  const attention = status.state === "attention";
  const title = signedOut ? "Check the right account." : active ? "You’re ready for your next handoff." : inactive ? "Your Pro access has ended." : attention ? "Your billing needs a look." : checking ? "Checking your payment." : "Payment confirmation is pending.";
  const description = signedOut
    ? "Sign in with the account you used for checkout to see its subscription."
    : active
      ? "Pro is active on your Woff account. Give your next room a name, set a deadline, and share it when it’s ready."
      : inactive
        ? "You can keep using Free. View plans or manage your billing below."
        : attention
          ? "Your subscription needs attention. Open billing to review the payment or subscription status. If you just made a payment, its confirmation may still be on the way."
          : checking
            ? "We’re checking for your payment confirmation. This usually takes a few seconds."
            : "Your payment hasn’t been confirmed on this account yet. You can check again or return to your account; it will update when confirmation arrives.";

  return (
    <section className="mx-auto max-w-xl rounded-2xl border bg-card px-6 py-9 shadow-sm sm:p-10">
      <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400" aria-hidden="true">
        {active ? <Check className="h-6 w-6" /> : checking && !signedOut ? <Loader2 className="h-5 w-5 motion-safe:animate-spin" /> : <CircleHelp className="h-6 w-6" />}
      </div>
      <div aria-live="polite">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{active ? "Woff Pro / Active" : inactive ? "Woff Pro / Ended" : "Woff Pro / Payment status"}</p>
        <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-5 text-sm leading-7 text-muted-foreground">{description}</p>
      </div>
      {active && status.paidThrough && <p className="mt-4 text-sm text-muted-foreground">Paid access through {new Date(status.paidThrough).toLocaleDateString("en", { dateStyle: "medium", timeZone: "UTC" })}.</p>}
      {error && <p role="alert" className="mt-5 rounded-lg border border-orange-500/30 p-3 text-sm leading-6">{error}</p>}
      <div className="mt-8 space-y-3">
        {signedOut ? (
          <Button asChild variant="primary" className="w-full"><Link href="/sign-in?next=%2Fcheckout%2Fcomplete">Sign in to check</Link></Button>
        ) : active ? (
          <Button asChild variant="primary" className="w-full"><Link href="/dashboard">Open your rooms</Link></Button>
        ) : inactive ? (
          <Button asChild variant="primary" className="w-full"><Link href="/pricing">View plans</Link></Button>
        ) : (
          <Button type="button" variant="outline" disabled={checking} aria-busy={checking} onClick={() => setAttempt((value) => value + 1)} className="h-12 w-full gap-2 rounded-xl">
            {checking ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" /> : <RefreshCw className="h-4 w-4" />}{checking ? "Checking your account…" : "Check again"}
          </Button>
        )}
        {!signedOut && status.hasSubscription && <BillingButton kind="portal" fullWidth />}
        <Button asChild variant="ghost" className="h-11 w-full rounded-xl"><Link href="/account">Back to your account</Link></Button>
      </div>
      {!active && !inactive && <p className="mt-6 border-t pt-5 text-xs leading-6 text-muted-foreground">Already paid? Please don’t buy again. If Pro hasn’t appeared after a few minutes, <Link href="/contact" className="font-medium text-foreground underline underline-offset-4">contact support</Link> with your receipt.</p>}
    </section>
  );
}
