import type { Metadata } from "next";
import Link from "next/link";
import { PublicPageShell, publicCardClass, publicPrimaryLinkClass } from "@/components/public-page-shell";
import { TemplateExample } from "@/components/template-example";

export const metadata: Metadata = {
  title: "Project Handoffs for Freelancers",
  description: "Deliver project files and instructions in one Woff room. Start with a reusable website handoff note; your client does not need an account.",
  alternates: { canonical: "/for-freelancers" },
};

const example = "# Project handoff\n\n## Project\nClient: Example Studio\nDelivery: Homepage draft\n\n## Included files\n- Homepage screenshot\n- Copy draft\n- Setup instructions\n\n## What to review\nConfirm the headline and contact button.\n\n## Next action\nReply in the room with corrections by Friday.\n\n## Keep a copy\nDownload the files and export this note before the room deadline.\n\n## Scope\nCredentials and permanent project records stay in their own secure systems.";

export default function FreelancerPage() {
  return <PublicPageShell eyebrow="For freelance designers and developers" title="Deliver the files." accent="Keep the context." description="Put a website handoff, design package, or small technical delivery and its instructions in one room. Your client can open the link without an account.">
    <div className="mb-12 flex flex-wrap justify-center gap-4"><Link href="/new?template=project-handoff" className={publicPrimaryLinkClass}>Start a project handoff</Link><Link href="/pricing" className="inline-flex items-center px-4 text-sm font-semibold text-orange-600 dark:text-orange-400">Explore the Pro pilot</Link></div>
    <section className="mb-12 grid gap-6 sm:grid-cols-3" aria-label="Project handoff steps">
      {[{ title: "Explain the delivery", text: "Start with the handoff note. List what is included and the one decision or next action your client needs to take." }, { title: "Attach the supporting files", text: "Add screenshots, PDFs, code, or other files within the upload limits. Mark up an image when a visual detail needs explanation." }, { title: "Share and finish", text: "Copy the full room link. Tell the client to download their files before expiry, and keep your originals in your project archive." }].map((step, index) => <div key={step.title} className={publicCardClass}><p className="mb-3 font-mono text-sm font-bold text-orange-500">0{index + 1}</p><h2 className="mb-3 text-lg font-bold">{step.title}</h2><p className="text-sm leading-7 text-muted-foreground">{step.text}</p></div>)}
    </section>
    <TemplateExample title="Project-handoff note" text={example} />
    <section className={`${publicCardClass} mt-10 space-y-4`}>
      <h2 className="text-xl font-bold">Start with the free workflow</h2>
      <p className="text-sm leading-7 text-muted-foreground">Basic rooms already combine instructions, files, and conversation. Notes have one editing owner. Room participants can send their own messages and marked-up images; this is not a formal approval or shared-document editor.</p>
      <p className="text-sm leading-7 text-muted-foreground">The Pro pilot adds sender organization and bounded delivery controls when available. See pricing for its current status. Upload-only client asset requests, team workspaces, and large video delivery are not part of this offering.</p>
      <div className="flex flex-wrap gap-5 text-sm font-semibold text-orange-600 dark:text-orange-400"><Link href="/help">Check limits and sharing help</Link><Link href="/blog/website-project-handoff-checklist">Read the website handoff guide</Link><Link href="/contact">Tell us about your last handoff</Link></div>
    </section>
  </PublicPageShell>;
}
