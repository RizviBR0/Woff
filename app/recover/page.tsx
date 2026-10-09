import type { Metadata } from "next";
import { PublicPageShell } from "@/components/public-page-shell";
import { RecoveryForm } from "./recovery-form";

export const metadata: Metadata = { title: { absolute: "Recover a room – Woff" }, referrer: "no-referrer", robots: { index: false, follow: false } };
export default function RecoverPage() {
  return <PublicPageShell eyebrow="Room owner" title="Recover your" accent="room controls." description="Use your saved room code or URL name and recovery key. Expired or deleted content cannot be restored."><RecoveryForm /></PublicPageShell>;
}
