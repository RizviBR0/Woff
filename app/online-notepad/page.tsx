import HomePage from "../page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Online Notepad - Share Notes & Text Instantly | Woff Space",
  description:
    "Free online notepad to write, save, and share text notes instantly without registration. Clean, fast, secure, and accessible on any device.",
  alternates: {
    canonical: "/online-notepad",
  },
};

export default function Page() {
  return <HomePage />;
}
