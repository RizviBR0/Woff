import type JSZip from "jszip";

export type ArchiveFile = { url: string; name: string };
export type ArchiveOptions = { signal?: AbortSignal; onProgress?: (completed: number, total: number) => void };

/** Fetch at most three files at once; a failed file prevents a partial archive. */
export async function addArchiveFiles(zip: JSZip, files: ArchiveFile[], options: ArchiveOptions = {}) {
  const names = new Set(Object.keys(zip.files));
  const targets = files.map((file) => {
    const clean = file.name.replace(/(^|\/)\.\.(?=\/|$)/g, "$1_").replace(/\\/g, "_") || "file";
    let name = clean;
    let suffix = 1;
    const dot = clean.lastIndexOf(".");
    while (names.has(name)) {
      name = dot > clean.lastIndexOf("/") ? `${clean.slice(0, dot)} (${suffix++})${clean.slice(dot)}` : `${clean} (${suffix++})`;
    }
    names.add(name);
    return { ...file, name };
  });
  const controller = new AbortController();
  const cancel = () => controller.abort();
  options.signal?.addEventListener("abort", cancel, { once: true });
  if (options.signal?.aborted) cancel();
  let next = 0;
  let completed = 0;
  let failure: unknown;
  try {
    await Promise.all(Array.from({ length: Math.min(3, targets.length) }, async () => {
      try {
        while (next < targets.length) {
          controller.signal.throwIfAborted();
          const file = targets[next++];
          const response = await fetch(file.url, { signal: controller.signal });
          if (!response.ok) throw new Error(`A file is unavailable (${response.status}). No partial ZIP was downloaded.`);
          const bytes = await response.arrayBuffer();
          controller.signal.throwIfAborted();
          zip.file(file.name, bytes);
          options.onProgress?.(++completed, targets.length);
        }
      } catch (error) {
        failure ??= error;
        controller.abort();
      }
    }));
    if (failure) throw failure;
    options.signal?.throwIfAborted();
  } finally {
    options.signal?.removeEventListener("abort", cancel);
  }
}

export async function generateArchive(zip: JSZip, options: ArchiveOptions = {}) {
  options.signal?.throwIfAborted();
  const blob = await zip.generateAsync({ type: "blob" }, ({ percent }) => options.onProgress?.(Math.round(percent), 100));
  options.signal?.throwIfAborted();
  return blob;
}
