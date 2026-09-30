import { ChevronDown } from "lucide-react";
import { SHARING_FAQS } from "@/lib/sharing-copy";

export function SharingFaq() {
  return (
    <section id="sharing-faq" aria-labelledby="sharing-faq-title" className="border-t border-border bg-background px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-10 text-center">
          <span className="inline-flex rounded-full border border-orange-500/25 bg-orange-500/10 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400">
            Before you share
          </span>
          <h2 id="sharing-faq-title" className="mt-6 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Quick sharing. Clear expectations.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Woff helps you send files quickly. Here&apos;s how long your shares last and how to keep a copy.
          </p>
        </div>
        <div className="space-y-3">
          {SHARING_FAQS.map(({ question, answer }, index) => (
            <details key={question} open={index === 0} className="group rounded-2xl border border-border bg-card/60 open:border-orange-500/30">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-5 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-base [&::-webkit-details-marker]:hidden">
                {question}
                <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-orange-500 transition-transform group-open:rotate-180" />
              </summary>
              <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
