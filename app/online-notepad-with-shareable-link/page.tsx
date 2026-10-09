import type { Metadata } from "next";
import { PublicSharingPage } from "@/components/public-sharing-page";

export const metadata: Metadata = {
  title: "Online Notepad With a Shareable Link",
  description:
    "Share notes and files instantly through a Woff room link. No sign-up required. Choose an optional time limit and keep your own copy of anything you need.",
  alternates: {
    canonical: "/online-notepad-with-shareable-link",
  },
};

export default function Page() {
  return <PublicSharingPage workflow={{
    eyebrow: "Write, share, keep a copy", title: "A notepad with a", accent: "shareable link",
    description: "Give your reader a focused note page. Keep related files and conversation in its room, and export the note when the handoff is complete.",
    action: "Start a shareable notepad",
    steps: [
      { title: "Write a titled note", text: "Create a room, choose Note, and write in rich text or raw Markdown. The note has its own address inside the room." },
      { title: "Pick the right link", text: "Note Share opens the document directly. Room Share opens all shared messages and files. Choose the context your recipient needs." },
      { title: "Export your copy", text: "Use the note's options menu for Markdown, plain text, or Print / PDF. A saved room link is not a backup." },
    ],
    exampleTitle: "A short delivery note",
    example: "Landing page handoff\n\nIncluded\n- Homepage screenshot\n- Copy draft\n- Setup notes\n\nReview request\nPlease confirm the headline and button label.\n\nNext step\nReply in the room with corrections, then download the final files.\n\nKeep a copy\nExport this note before the room expires.",
    useCases: ["A focused note page for a client or teammate", "Formatted instructions that can also be downloaded as Markdown", "An explanation kept alongside supporting files"],
    boundary: "Only the note's creator can edit it. Sharing a room gives participants access to its shared content. Do not use Woff for a permanent archive or share a recovery key with a reader.",
  }} />;
}
