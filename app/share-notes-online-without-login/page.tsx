import HomePage from "../page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Share Notes Online Without Login - Instant Web Notes | Woff Space",
  description:
    "Create and share notes online instantly without logging in. Get a secure, shareable link for text and files in one click.",
  alternates: {
    canonical: "/share-notes-online-without-login",
  },
};

export default function Page() {
  return <HomePage />;
}
