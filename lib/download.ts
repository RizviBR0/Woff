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
 * Dispatch private files directly to the browser; local/legacy URLs use Blobs.
 * Resolves once the download has been dispatched to the browser.
 */
export async function downloadFileFromUrl(url: string, filename: string): Promise<void> {
  const target = new URL(url, window.location.href);
  if (target.origin === window.location.origin && target.pathname.startsWith("/api/files/")) {
    target.searchParams.set("download", filename);
    const anchor = document.createElement("a");
    anchor.href = target.href;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return;
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch file: ${res.statusText}`);
  }
  const blob = await res.blob();
  triggerBlobDownload(blob, filename);
}
