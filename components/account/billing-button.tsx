"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function BillingButton({
  kind,
  disabled = false,
  label,
  fullWidth = false,
}: {
  kind: "checkout" | "portal";
  disabled?: boolean;
  label?: string;
  fullWidth?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  async function openBilling() {
    setBusy(true);
    setError("");
    setErrorCode("");
    try {
      const response = await fetch(`/api/billing/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(40_000),
      });
      const result = await response.json();
      if (!response.ok || !result.url) {
        setErrorCode(typeof result.code === "string" ? result.code : "");
        throw new Error(
          result.error || "Billing is unavailable. Please try later.",
        );
      }
      const destination = new URL(result.url);
      if (destination.protocol !== "https:" || destination.port || destination.username || destination.password ||
        !(destination.hostname === "lemonsqueezy.com" || destination.hostname.endsWith(".lemonsqueezy.com")))
        throw new Error("We couldn’t open a secure checkout. Please contact support.");
      window.location.assign(destination.toString());
    } catch (cause) {
      setError(
        cause instanceof Error && cause.name === "TimeoutError"
          ? "Checkout is taking longer than expected. Please wait a moment before retrying."
          : cause instanceof Error
          ? cause.message
          : "Billing is unavailable. Please try later.",
      );
      setBusy(false);
    }
  }
  return (
    <div className={cn(fullWidth && "w-full")}>
      <Button
        type="button"
        variant="primary"
        onClick={openBilling}
        disabled={disabled || busy}
        aria-busy={busy}
        className={cn(fullWidth && "h-auto min-h-12 w-full whitespace-normal py-3")}
      >
        {busy && <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 motion-safe:animate-spin" />}
        <span className="min-w-0 leading-5">{busy
          ? "Opening…"
          : label || (kind === "checkout"
            ? "Upgrade to Pro · $8/month"
            : "Manage billing")}</span>
      </Button>
      {error && (
        <p
          role="alert"
          className="mt-3 text-sm text-orange-600 dark:text-orange-400"
        >
          {error}
          {errorCode === "sign_in_required" && <> <Link className="underline underline-offset-4" href="/sign-in?next=%2Fcheckout">Sign in</Link>.</>}
          {errorCode === "existing_subscription" && <> <Link className="underline underline-offset-4" href="/account">Open your account</Link>.</>}
          {errorCode === "checkout_pending" && <> <Link className="underline underline-offset-4" href="/checkout/complete">Check payment status</Link>.</>}
        </p>
      )}
    </div>
  );
}
