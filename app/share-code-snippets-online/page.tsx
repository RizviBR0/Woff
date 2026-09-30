import HomePage from "../page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Share Code Snippets Online - Instant Code Notepad | Woff Space",
  description:
    "Share code snippets and quick notes through a temporary Woff room. No sign-up required. Save a copy outside Woff to keep your work.",
  alternates: {
    canonical: "/share-code-snippets-online",
  },
};

export default function Page() {
  return <HomePage />;
}
