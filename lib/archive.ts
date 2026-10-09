import type JSZip from "jszip";

export type ArchiveFile = { url: string; name: string };
export type ArchiveOptions = { signal?: AbortSignal; maxBytes?: number; onProgress?: (completed: number, total: number) => void };
const archiveBytes = new WeakMap<JSZip, number>();
const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;

function reserveBytes(zip: JSZip, size: number, limit = MAX_ARCHIVE_BYTES) {
  const next = (archiveBytes.get(zip) || 0) + size;
  if (next > limit) throw new Error("This ZIP exceeds the 128 MiB browser limit. Download files individually or in smaller groups.");
  archiveBytes.set(zip, next);
}

export function addArchiveText(zip: JSZip, name: string, content: string) {
  reserveBytes(zip, new TextEncoder().encode(content).byteLength);
  zip.file(name, content);
}

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
          const chunks: Uint8Array[] = [];
          let size = 0;
          if (!response.body) throw new Error("A file is unavailable. No partial ZIP was downloaded.");
          const reader = response.body.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              reserveBytes(zip, value.byteLength, options.maxBytes);
              size += value.byteLength;
              chunks.push(value);
            }
          } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
          const bytes = new Uint8Array(size);
          let offset = 0;
          for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
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
