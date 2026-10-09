"use client";

import { formatDateLabel, type DateLabelMode } from "@/lib/date-labels";
import { useClientNow } from "@/lib/hooks/use-client-now";

export function LocalDateTime({ value, mode = "date-time", className }: {
  value: string;
  mode?: DateLabelMode;
  className?: string;
}) {
  const now = useClientNow();
  return <time dateTime={value} className={className}>
    {formatDateLabel(value, mode, now !== null)}
  </time>;
}
