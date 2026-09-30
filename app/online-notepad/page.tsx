import { OnlineNotepadClient } from "@/components/online-notepad-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Online Notepad With Shareable Link - Woff Space",
  description:
    "Write and share quick notes alongside files in a temporary Woff space. No sign-up required. Save a copy outside Woff to keep your notes.",
  alternates: {
    canonical: "/online-notepad",
  },
};

export default function Page() {
  return <OnlineNotepadClient />;
}
