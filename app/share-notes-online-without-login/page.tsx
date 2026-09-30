import HomePage from "../page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Share Notes Online Without Login - Instant Web Notes | Woff Space",
  description:
    "Share notes and files instantly without signing up. Woff links are for temporary sharing. Keep your own copy of notes and files you need.",
  alternates: {
    canonical: "/share-notes-online-without-login",
  },
};

export default function Page() {
  return <HomePage />;
}
