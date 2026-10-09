import type { Metadata } from "next";
import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { getSenderDashboard } from "@/lib/dashboard-actions";
import { SenderDashboardClient } from "./sender-dashboard-client";
import { DashboardShell } from "./dashboard-shell";
import styles from "./dashboard.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { absolute: "Dashboard – Woff" }, robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function DashboardPage() {
  let dashboard;
  try { dashboard = await getSenderDashboard(); }
  catch (error) {
    const needsSignIn = error instanceof Error && error.message === "Verify your email before continuing.";
    return <DashboardShell><section className={styles.unavailable}>
      <span className={styles.emptyIcon}><LayoutDashboard size={26} aria-hidden="true" /></span>
      <h1>{needsSignIn ? "Your rooms, in one place" : "Dashboard unavailable"}</h1>
      <p>{needsSignIn ? "Sign in to see and manage your rooms." : "We couldn’t load your rooms. Please try again."}</p>
      <Link href={needsSignIn ? "/sign-in?next=%2Fdashboard" : "/dashboard"} className={`cta-button-glow ${styles.createButton}`}>
        {needsSignIn ? "Sign in" : "Try again"}
      </Link>
      <Link href="/" className={styles.quietLink}>Keep sharing as a guest</Link>
    </section></DashboardShell>;
  }
  return <DashboardShell><SenderDashboardClient initial={dashboard} serverNow={Date.now()} /></DashboardShell>;
}
