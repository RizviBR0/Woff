import HomePage from "../page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Share Text Between Devices Instantly - Cross-Device Sync | Woff Space",
  description:
    "Easily transfer text, links, and documents between phone, PC, and tablet. No accounts required. Fast, secure, and temporary peer-to-peer sharing.",
  alternates: {
    canonical: "/share-text-between-devices",
  },
};

export default function Page() {
  return <HomePage />;
}
