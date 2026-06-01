import HomePage from "../page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Share Code Snippets Online - Instant Code Notepad | Woff Space",
  description:
    "Quickly share code snippets and text notes online. Lightweight online notepad supporting fast sharing and secure, private room access.",
  alternates: {
    canonical: "/share-code-snippets-online",
  },
};

export default function Page() {
  return <HomePage />;
}
