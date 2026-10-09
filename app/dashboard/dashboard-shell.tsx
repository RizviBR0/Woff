import type { ReactNode } from "react";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import styles from "./dashboard.module.css";

export function DashboardShell({ children }: { children: ReactNode }) {
  return <div className={styles.page}>
    <Navbar />
    <main id="main-content" className={styles.main}>{children}</main>
    <footer className={styles.footer}>
      <span>Woff</span>
      <div><Link href="/help">Help</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div>
    </footer>
  </div>;
}
