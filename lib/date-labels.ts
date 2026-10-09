export type DateLabelMode = "time" | "date-time";

// ISO text is independent of the server/browser locale, timezone and clock.
export function formatDateLabel(value: string, mode: DateLabelMode, local: boolean): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  if (!local) {
    const iso = date.toISOString();
    return mode === "time"
      ? `${iso.slice(11, 16)} UTC`
      : `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
  }
  return mode === "time"
    ? date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    : date.toLocaleString();
}

export function formatActivityDate(value: string, clientNow: number | null): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  if (clientNow === null) return date.toISOString().slice(0, 10);
  const now = new Date(clientNow);
  const sameDay = (other: Date) => date.getFullYear() === other.getFullYear()
    && date.getMonth() === other.getMonth() && date.getDate() === other.getDate();
  if (sameDay(now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(yesterday)) return "Yesterday";
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" }).format(date);
}
