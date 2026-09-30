import HomePage from "../page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Share Text Between Devices Instantly - Cross-Device Sync | Woff Space",
  description:
    "Transfer text, links, and documents between phone, PC, and tablet with a link, room code, or QR code. No sign-up. Temporary sharing, not cloud storage.",
  alternates: {
    canonical: "/share-text-between-devices",
  },
};

export default function Page() {
  return <HomePage />;
}
