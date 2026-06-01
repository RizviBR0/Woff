import { OnlineNotepadClient } from "@/components/online-notepad-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Online Notepad With Shareable Link - Woff Space",
  description:
    "Use Woff Space as a fast online notepad with a shareable link. Write, save, and share notes instantly without signup. Free, secure, and cross-device.",
  alternates: {
    canonical: "/online-notepad",
  },
};

export default function Page() {
  return <OnlineNotepadClient />;
}
