import type { Metadata } from "next";
import { PublicSharingPage } from "@/components/public-sharing-page";

export const metadata: Metadata = {
  title: "Share Text Between Phone and Computer",
  description:
    "Transfer text, links, and documents between phone, PC, and tablet with a link, room code, or QR code. No sign-up. Temporary sharing, not cloud storage.",
  alternates: {
    canonical: "/share-text-between-devices",
  },
};

export default function Page() {
  return <PublicSharingPage workflow={{
    eyebrow: "Your browser on both devices", title: "Move text between", accent: "phone and computer",
    description: "Send a URL, caption, or small block of text through a sharing room. Open the same room on your other device and copy what you need.",
    action: "Create a transfer room",
    steps: [
      { title: "Paste and send", text: "Create a room on your first device. Paste the text in the composer and select Send." },
      { title: "Open on the other device", text: "Open Share and scan its QR code with your phone, or send the full room invitation link to the other browser." },
      { title: "Copy the text", text: "Use the message's copy action on the second device. This transfers text you explicitly send; it does not read your clipboard in the background." },
    ],
    exampleTitle: "A text transfer example",
    example: "Caption for the portfolio update\n\nNew homepage layout: clearer navigation, fewer steps, and better mobile spacing.\n\nReference link\nhttps://example.com/portfolio\n\nCopy this text on the other device, then replace it with your own.",
    useCases: ["A URL from a phone that you want to open on a laptop", "A caption written on a computer for a mobile post", "A short instruction or non-sensitive setup command"],
    boundary: "Both devices need an internet connection. Room access is separate from note editing ownership; this is not automatic clipboard sync. Never transfer passwords, access tokens, or private keys through a shared room.",
  }} />;
}
