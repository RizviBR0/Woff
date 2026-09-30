import HomePage from "../page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Online Notepad with Shareable Link - Quick Text Sharing | Woff Space",
  description:
    "Share notes and files instantly through a temporary Woff link. No sign-up required. Keep your own copy of anything you need.",
  alternates: {
    canonical: "/online-notepad-with-shareable-link",
  },
};

export default function Page() {
  return <HomePage />;
}
