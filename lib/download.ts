/**
 * Utility functions for triggering reliable browser downloads.
 */

/**
 * Triggers a browser download for a Blob object.
 */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

/**
 * Downloads a file from a URL with blob handling.
 * Resolves once the download has been dispatched to the browser.
 */
export async function downloadFileFromUrl(url: string, filename: string): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch file: ${res.statusText}`);
    }
    const blob = await res.blob();
    triggerBlobDownload(blob, filename);
  } catch {
    // Fallback if fetch is blocked or fails: direct navigation/anchor
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}
