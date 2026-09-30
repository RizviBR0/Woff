import Link from "next/link";
import { ArrowDownToLine } from "lucide-react";
import {
  EXTENSION_FILE_RETENTION,
  PRO_SPACE_RETENTION,
  SHARING_NOTICE,
  STANDARD_SPACE_RETENTION,
} from "@/lib/sharing-copy";

export function SharingNotice({ isPro }: { isPro?: boolean }) {
  return (
    <aside aria-label="Temporary sharing and file lifetime" className="rounded-xl border border-orange-500/20 bg-orange-500/[0.04] px-4 py-3 text-left">
      <div className="flex items-start gap-2.5">
        <ArrowDownToLine aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" />
        <div className="min-w-0 space-y-1.5">
          <p className="text-sm font-medium leading-relaxed text-foreground">{SHARING_NOTICE}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {isPro === undefined
              ? "File availability follows the room's expiry rules. Save a copy outside Woff."
              : isPro ? PRO_SPACE_RETENTION : STANDARD_SPACE_RETENTION}
          </p>
          <details className="text-xs text-muted-foreground">
            <summary className="w-fit cursor-pointer rounded-sm font-medium underline decoration-orange-500/40 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              More about file lifetime
            </summary>
            <p className="mt-2 leading-relaxed">
              {EXTENSION_FILE_RETENTION}{" "}
              <Link href="/#sharing-faq" className="font-medium text-foreground underline underline-offset-4">Sharing FAQ</Link>
            </p>
          </details>
        </div>
      </div>
    </aside>
  );
}
