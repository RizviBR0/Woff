import Link from "next/link";
import Image from "next/image";
import { cookies } from "next/headers";
import { Check } from "lucide-react";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { SignInForm } from "@/components/account/sign-in-form";
import { Button } from "@/components/ui/button";
import { getLaunchConfig } from "@/lib/launch-config";
import { AUTH_RETURN_COOKIE } from "@/lib/account";
import { isVerifiedSender, safeReturnPath } from "@/lib/account-helpers";
import { createServerSupabaseClient } from "@/lib/supabase";
import styles from "./auth.module.css";

const errors: Record<string, string> = {
  "transfer-required": "This browser has rooms under a different account. Sign in here and request a fresh email link to bring them with you. Your current rooms are still safe.",
  "transfer-expired": "Your room transfer link expired. Request a new sign-in link in this browser to keep your rooms together.",
  "transfer-failed": "We could not transfer your rooms. Your current session was kept. Request a fresh link and try again.",
  "account-unavailable": "We could not prepare your account just now. Your current session was kept. Please try again later.",
};

export async function AuthPage({ mode, params }: {
  mode: "existing" | "link";
  params: { next?: string; error?: string };
}) {
  const signingUp = mode === "link";
  const config = getLaunchConfig();
  const next = safeReturnPath(params.next ?? (await cookies()).get(AUTH_RETURN_COOKIE)?.value);
  let signedInEmail: string | undefined;
  if (config.accountsEnabled) {
    try {
      const supabase = await createServerSupabaseClient();
      const { data: { user }, error } = await supabase.auth.getUser();
      if (!error && isVerifiedSender(user)) signedInEmail = user?.email;
    } catch { /* The form can explain a temporary account outage on submission. */ }
  }
  return (
    <div className={styles.page}>
      <main id="main-content" className={styles.frame}>
        <header className={styles.header}>
          <Link href="/" aria-label="Woff home" className={styles.logo}>
            <Image src="/logo_dark.svg" alt="Woff" width={110} height={38} priority />
          </Link>
          <div className={styles.headerSwitch}>
            {signedInEmail ? <Link href="/account">Your account</Link> : <>
              <span>{signingUp ? "Already have an account?" : "Don’t have an account?"}</span>
              <Link href={`${signingUp ? "/sign-in" : "/sign-up"}?next=${encodeURIComponent(next)}`}>
                {signingUp ? "Sign in" : "Sign up"}
              </Link>
            </>}
          </div>
        </header>
        <aside className={styles.artPanel} aria-hidden="true">
          <Image
            src={signingUp ? "/auth/sign-up-art.webp" : "/auth/sign-in-art.webp"}
            alt=""
            fill
            priority
            sizes="(max-width: 760px) 100vw, 50vw"
            className={styles.art}
          />
        </aside>
        <section className={styles.formPanel} aria-label={signingUp ? "Create an account" : "Sign in to Woff"}>
          <div className={styles.formInner}>
            {signedInEmail ? <>
              <span className={styles.accountStatus}><Check size={16} aria-hidden="true" /> Signed in</span>
              <h1 className={styles.heading}>You’re signed in</h1>
              <p className={styles.description}>Continue with <span className="break-all text-foreground">{signedInEmail}</span>.</p>
              <Button asChild variant="primary" className={styles.primaryLink}><Link href={next}>{next.startsWith("/checkout") ? "Continue to Pro" : "Open your rooms"}</Link></Button>
              <Link href="/account" className={styles.secondaryLink}>Manage your account</Link>
            </> : <>
              <h1 className={styles.heading}>{signingUp ? "Create an account" : "Sign in"}</h1>
              <p className={styles.description}>{signingUp ? "Bring your Woff rooms together." : "Sign in to your Woff account."}</p>
              {params.error && <p role="alert" className={styles.error}>{errors[params.error] || "That email link could not be completed. Request a new link and open it in this browser."}</p>}
              <SignInForm mode={mode} next={next} enabled={config.accountsEnabled && config.emailDeliveryVerified} />
            </>}
            <div className={styles.guestNote}><Link href="/">Keep sharing as a guest</Link></div>
          </div>
          <footer className={styles.footer}>
            <div><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/help">Help</Link></div>
            <AnimatedThemeToggler className={styles.themeToggle} aria-label="Change color theme" />
          </footer>
        </section>
      </main>
    </div>
  );
}
