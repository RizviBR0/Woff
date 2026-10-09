import Link from "next/link";
import { PublicPageShell, publicCardClass, publicPrimaryLinkClass } from "@/components/public-page-shell";
import { TemplateExample } from "@/components/template-example";

export interface PublicSharingWorkflow {
  eyebrow: string;
  title: string;
  accent: string;
  description: string;
  action: string;
  steps: Array<{ title: string; text: string }>;
  exampleTitle: string;
  example: string;
  useCases: string[];
  boundary: string;
}

export function PublicSharingPage({ workflow }: { workflow: PublicSharingWorkflow }) {
  return (
    <PublicPageShell {...workflow}>
      <div className="mb-14 flex flex-wrap justify-center gap-4">
        <Link href="/new" className={publicPrimaryLinkClass}>{workflow.action}</Link>
        <Link href="/help" className="inline-flex min-h-11 items-center px-4 text-sm font-semibold text-muted-foreground underline underline-offset-4 hover:text-foreground">Sharing help</Link>
      </div>
      <section aria-label="Sharing steps" className="mb-12 grid gap-5 sm:grid-cols-3">
        {workflow.steps.map((step, index) => (
          <div key={step.title} className={publicCardClass}>
            <span className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 font-bold text-orange-500">{index + 1}</span>
            <h2 className="mb-3 text-lg font-bold">{step.title}</h2>
            <p className="text-sm leading-7 text-muted-foreground">{step.text}</p>
          </div>
        ))}
      </section>
      <TemplateExample title={workflow.exampleTitle} text={workflow.example} />
      <section className="mt-12 grid gap-6 sm:grid-cols-2">
        <div className={publicCardClass}>
          <h2 className="mb-4 text-xl font-bold">Useful for</h2>
          <ul className="list-disc space-y-3 pl-5 text-sm leading-7 text-muted-foreground">{workflow.useCases.map((useCase) => <li key={useCase}>{useCase}</li>)}</ul>
        </div>
        <div className={publicCardClass}>
          <h2 className="mb-4 text-xl font-bold">Before you share</h2>
          <p className="text-sm leading-7 text-muted-foreground">{workflow.boundary}</p>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">New rooms have no time limit. The owner can set a deadline in Share; check the room&apos;s top bar and keep a copy of anything you need.</p>
        </div>
      </section>
      <div className="mt-12 flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm font-semibold text-orange-600 dark:text-orange-400">
        <Link href="/online-notepad">Online notepad</Link><Link href="/for-freelancers">Project handoffs</Link><Link href="/pricing">Plans and limits</Link>
      </div>
    </PublicPageShell>
  );
}
