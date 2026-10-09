"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { sendSignInEmail, type SignInState } from "@/app/sign-in/actions";
import { Button } from "@/components/ui/button";
import styles from "./auth.module.css";

type Props = { next: string; enabled: boolean; mode: "existing" | "link" };

export function SignInForm(props: Props) {
  const [attempt, setAttempt] = useState(0);
  return <EmailForm key={attempt} {...props} onReset={() => setAttempt(value => value + 1)} />;
}

function EmailForm({ next, enabled, mode, onReset }: Props & { onReset: () => void }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(sendSignInEmail, {});
  const [email, setEmail] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const sentHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!state.ok) return;
    sentHeading.current?.focus();
    const until = Date.now() + 60_000;
    setCooldown(60);
    const timer = window.setInterval(() => {
      const seconds = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setCooldown(seconds);
      if (!seconds) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [state]);

  return <form action={action} className={styles.form} aria-busy={pending}>
    <input type="hidden" name="next" value={next} />
    <input type="hidden" name="mode" value={mode} />
    {state.ok ? <div className={styles.sentPanel}>
      <span className={styles.sentIcon}><Mail size={21} aria-hidden="true" /></span>
      <h2 tabIndex={-1} ref={sentHeading}>Check your email</h2>
      <p className="break-all">{state.email || email}</p>
      <p className={styles.sentMessage}>{state.message}</p>
      <input type="hidden" name="email" value={state.email || email} />
      <div className={styles.sentActions}><button type="submit" disabled={pending || cooldown > 0}>{pending ? "Sending…" : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend link"}</button><button type="button" disabled={pending} onClick={onReset}>Use another email</button></div>
      <p className={styles.spamHint}>Can&apos;t find it? Check your spam folder too.</p>
    </div> : <>
      <label htmlFor="account-email" className={styles.emailLabel}>Continue with email</label>
      <div className={styles.emailField}><Mail size={20} aria-hidden="true" /><input id="account-email" name="email" type="email" required autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={254} placeholder="name@youremail.com" value={email} onChange={event => setEmail(event.target.value)} disabled={!enabled || pending} /></div>
      <Button variant="primary" type="submit" disabled={!enabled || pending} className={styles.submit}>{pending ? <><span>Sending your link…</span><Loader2 size={20} aria-hidden="true" className="motion-safe:animate-spin" /></> : <><span>{mode === "link" ? "Create account" : "Send sign-in link"}</span></>}</Button>
      {state.message && <p role="alert" className={styles.error}>{state.message}</p>}
      {!enabled && <p role="status" className={styles.error}>Email sign-in is being prepared. You can keep sharing as a guest.</p>}
      <p className={styles.roomSafety}>{mode === "link" ? "Your current rooms stay with you after verification." : "Open the link here within 10 minutes to keep your guest rooms."}</p>
    </>}
  </form>;
}
