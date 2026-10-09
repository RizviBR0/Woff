"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copyTextToClipboard } from "@/lib/note-export";

export function TemplateExample({ title, text }: { title: string; text: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <div className="overflow-hidden rounded-2xl border bg-muted/30">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={async () => setStatus(await copyTextToClipboard(text) ? "copied" : "failed")}
          className="min-h-10 gap-2 text-orange-600 hover:bg-orange-500/10 hover:text-orange-600 focus-visible:ring-orange-500 dark:text-orange-400 dark:hover:text-orange-400"
        >
          {status === "copied" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {status === "copied" ? "Copied" : "Copy example"}
        </Button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words p-5 font-mono text-sm leading-7">{text}</pre>
      <p role="status" className="px-5 pb-3 text-xs text-muted-foreground">{status === "failed" ? "Copy was unavailable. Select the example text and copy it manually." : status === "copied" ? "Example copied. Paste it into a Woff message or note." : "Replace the example details with your own before sharing."}</p>
    </div>
  );
}
