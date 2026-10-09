import type { Metadata } from "next";
import { PublicSharingPage } from "@/components/public-sharing-page";

export const metadata: Metadata = {
  title: "Share Notes Online Without Login",
  description:
    "Share notes and files instantly without signing up. Leave the room open or choose a time limit. Keep your own copy of notes and files you need.",
  alternates: {
    canonical: "/share-notes-online-without-login",
  },
};

export default function Page() {
  return <PublicSharingPage workflow={{
    eyebrow: "A note and a link", title: "Share notes online", accent: "without login",
    description: "Put the explanation in a rich note and send one link. Your reader can open it in a browser without creating an account.",
    action: "Create a note-sharing room",
    steps: [
      { title: "Create a room", text: "Start an empty sharing room. No registration is needed for the free sharing workflow." },
      { title: "Choose Note", text: "Use Note in the composer. Add a title, headings, links, or a checklist. Wait for the saved status before leaving." },
      { title: "Send the note link", text: "Use Share in the note to copy its link or QR code. Its creator can edit; recipients can read and export an unlocked note." },
    ],
    exampleTitle: "A meeting recap you can reuse",
    example: "Website review — 3 October\n\nDecision\nUse the shorter homepage introduction.\n\nNext action\nMina: send the final logo by Friday.\nRafi: update the staging page after the logo arrives.\n\nReference\nAdd the staging link here.\n\nPlease reply in the room if a name or deadline is incorrect.",
    useCases: ["A class summary with a few reference links", "A meeting decision and the next action", "Instructions beside a screenshot or small attachment"],
    boundary: "Notes have one editing owner. Room participants can contribute their own messages and notes; they do not coedit your document. A private note is visible only to its creator. Keep credentials and sensitive records out of temporary shared rooms.",
  }} />;
}
