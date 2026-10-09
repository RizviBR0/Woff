import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { CheckoutResult } from "@/components/account/checkout-result";
import { getAccountContext } from "@/lib/account";
import { isVerifiedSender } from "@/lib/account-helpers";
import { checkoutStatus } from "@/lib/billing/checkout-state";

export const metadata: Metadata = {
  title: "Your Pro payment status",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function CheckoutCompletePage() {
  const { user, account, available } = await getAccountContext();
  const verified = isVerifiedSender(user);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
        {available && verified && account ? <CheckoutResult initialStatus={checkoutStatus(account)} /> : (
          <section className="mx-auto max-w-xl rounded-2xl border bg-card p-7 sm:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400">Woff Pro / Payment status</p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">{available && !verified ? "Let’s check your account." : "We couldn’t check just yet."}</h1>
            <p className="mt-5 text-sm leading-7 text-muted-foreground">{available && !verified ? "Sign in with the account you used for checkout. We’ll check its verified subscription status." : "Your account is temporarily unavailable. Try again in a moment. If you already paid, don’t start another purchase."}</p>
            <Button asChild className="mt-7 h-12 w-full rounded-xl"><Link href={available && !verified ? "/sign-in?next=%2Fcheckout%2Fcomplete" : "/checkout/complete"}>{available && !verified ? "Sign in to check" : "Try again"}</Link></Button>
            <p className="mt-5 text-center text-sm text-muted-foreground"><Link href="/contact" className="underline underline-offset-4">Need help with a payment?</Link></p>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}
