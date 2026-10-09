import type { Metadata } from "next";
import { PublicSharingPage } from "@/components/public-sharing-page";

export const metadata: Metadata = {
  title: "Share Code Snippets With Context",
  description:
    "Share code snippets and quick notes through a Woff room. No sign-up required. Choose an optional time limit and save a copy outside Woff to keep your work.",
  alternates: {
    canonical: "/share-code-snippets-online",
  },
};

export default function Page() {
  return <PublicSharingPage workflow={{
    eyebrow: "A snippet, not a repository", title: "Share code with", accent: "the explanation",
    description: "Put the smallest useful snippet, expected behavior, and actual result together. Add a screenshot or file when it helps someone reproduce the issue.",
    action: "Create a code-sharing room",
    steps: [
      { title: "Reduce the example", text: "Remove credentials, private endpoints, and unrelated code. State what you expected and what happened instead." },
      { title: "Use a fenced block", text: "Wrap code in triple backticks and include its language, or use the composer's code-block action. Select Send to publish it." },
      { title: "Share the room", text: "Send the full room link so the reader also sees your error description and attachments. Woff does not execute your code." },
    ],
    exampleTitle: "A small bug report",
    example: "Problem: the button sends the form twice.\nExpected: one request per click.\nActual: two requests appear in the network panel.\n\n```tsx\n<button type=\"submit\" onClick={save}>\n  Save\n</button>\n```\n\nQuestion: should the save handler belong on the form instead?\nAttached: a screenshot with personal data removed.",
    useCases: ["A minimal bug reproduction with a screenshot", "A setup command with its expected output", "A code review question that does not need a full repository"],
    boundary: "Woff is a temporary handoff, not source control or a code runner. Use your repository for history and long-lived code. Review every snippet for secrets before sharing.",
  }} />;
}
