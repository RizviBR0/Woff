import HomePage from "../page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Online Notepad with Shareable Link - Quick Text Sharing | Woff Space",
  description:
    "A simple online notepad that generates a secure shareable link instantly. Share text, files, and snippets across devices with zero setup.",
  alternates: {
    canonical: "/online-notepad-with-shareable-link",
  },
};

export default function Page() {
  return <HomePage />;
}
