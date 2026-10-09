import { OnlineNotepadClient } from "@/components/online-notepad-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Online Notepad With Shareable Link",
  description:
    "Write and share quick notes alongside files in a Woff room. No sign-up required. Choose an optional time limit and save a copy outside Woff to keep your notes.",
  alternates: {
    canonical: "/online-notepad",
  },
};

export default function Page() {
  return <OnlineNotepadClient />;
}
