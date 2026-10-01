import { triggerBlobDownload } from "./download";

/**
 * Downloads note content as a Markdown (.md) file.
 */
export function downloadMarkdownNote(title: string, markdownContent: string): void {
  const baseName = title.trim() || "note";
  const filename = baseName.toLowerCase().endsWith(".md")
    ? baseName
    : `${baseName}.md`;
  const blob = new Blob([markdownContent], {
    type: "text/markdown;charset=utf-8",
  });
  triggerBlobDownload(blob, filename);
}

/**
 * Downloads note content as a Plain Text (.txt) file.
 */
export function downloadPlainTextNote(title: string, plainText: string): void {
  const baseName = title.trim() || "note";
  const filename = baseName.toLowerCase().endsWith(".txt")
    ? baseName
    : `${baseName}.txt`;
  const blob = new Blob([plainText], {
    type: "text/plain;charset=utf-8",
  });
  triggerBlobDownload(blob, filename);
}

/**
 * Triggers high-fidelity browser native print-to-PDF.
 * Renders vector typography, system fonts (including Bangla and Arabic),
 * images, and styled layout via @media print CSS.
 */
export function triggerPrintNote(): void {
  if (typeof window !== "undefined") {
    window.print();
  }
}

/**
 * Copies text to the clipboard with legacy fallback.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fallback below
    }
  }

  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const success = document.execCommand("copy");
    document.body.removeChild(textArea);
    return success;
  } catch {
    return false;
  }
}
