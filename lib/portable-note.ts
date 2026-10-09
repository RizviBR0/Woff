function escapeText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function standaloneNoteHtml(
  title: string,
  sanitizedContent: string,
): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src 'none'; base-uri 'none'; form-action 'none'"><title>${escapeText(title)}</title><style>body{font-family:system-ui,sans-serif;line-height:1.6;color:#171717;background:white;max-width:760px;margin:40px auto;padding:0 24px;overflow-wrap:anywhere}img{max-width:100%;height:auto}pre{white-space:pre-wrap;background:#f4f4f5;padding:16px;border-radius:8px}blockquote{border-left:3px solid #ff5a00;margin-left:0;padding-left:16px}a{color:#c2410c}ul[data-type=taskList]{list-style:none;padding-left:0}li[data-type=taskItem]{display:flex;gap:8px}li[data-type=taskItem]>div{flex:1}h1,h2,h3{break-after:avoid}img,pre,blockquote{break-inside:avoid}@page{size:A4;margin:18mm}@media print{body{margin:0;padding:0;max-width:none}}</style></head><body><h1>${escapeText(title)}</h1>${sanitizedContent}</body></html>`;
}

/** Bound image bytes while reading, before allocating an export blob. */
export async function readNoteImage(
  response: Response,
  remainingBytes: number,
): Promise<Blob> {
  const type = (response.headers.get("content-type") || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const tooLarge = () =>
    new Error(
      "Note images are too large or unavailable. Export them individually.",
    );
  if (
    !type.startsWith("image/") ||
    Number(response.headers.get("content-length") || 0) > remainingBytes
  ) {
    await response.body?.cancel().catch(() => undefined);
    throw tooLarge();
  }
  if (!response.body)
    throw new Error("A note image is unavailable. Download was cancelled.");
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > remainingBytes) throw tooLarge();
      chunks.push(new Uint8Array(value));
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  return new Blob(chunks, { type });
}

/** Embed image bytes so exported notes survive room expiry. Abort on missing assets. */
export async function portableNoteHtml(
  title: string,
  sanitizedContent: string,
  signal?: AbortSignal,
): Promise<string> {
  const document = new DOMParser().parseFromString(
    sanitizedContent,
    "text/html",
  );
  let totalBytes = 0;
  for (const image of Array.from(document.querySelectorAll("img"))) {
    signal?.throwIfAborted();
    const source = image.getAttribute("src") || "";
    if (source.startsWith("data:image/")) {
      totalBytes += source.length;
      if (totalBytes > 64 * 1024 * 1024)
        throw new Error("Note images are too large. Export them individually.");
      continue;
    }
    const url = new URL(source, window.location.origin);
    if (!["https:", "http:"].includes(url.protocol))
      throw new Error("An image cannot be exported.");
    const response = await fetch(url, {
      credentials:
        url.origin === window.location.origin ? "same-origin" : "omit",
      signal,
    });
    if (!response.ok)
      throw new Error("A note image is unavailable. Download was cancelled.");
    const blob = await readNoteImage(response, 64 * 1024 * 1024 - totalBytes);
    totalBytes += blob.size;
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Unable to export image"));
      reader.readAsDataURL(blob);
    });
    image.setAttribute("src", data);
    image.removeAttribute("srcset");
  }
  signal?.throwIfAborted();
  return standaloneNoteHtml(title, document.body.innerHTML);
}

export async function printPortableNote(
  title: string,
  content: string,
): Promise<void> {
  const html = await portableNoteHtml(title, content);
  const frame = document.createElement("iframe");
  frame.title = "Note print preview";
  frame.style.cssText =
    "position:fixed;width:1px;height:1px;left:-10000px;top:0;border:0";
  frame.setAttribute("sandbox", "allow-same-origin allow-modals");
  document.body.appendChild(frame);
  try {
    const loaded = new Promise<void>((resolve) => {
      frame.onload = () => resolve();
    });
    frame.srcdoc = html;
    await loaded;
    await Promise.all(
      Array.from(frame.contentDocument?.images || []).map((image) =>
        image.decode().catch(() => undefined),
      ),
    );
    if (!frame.contentWindow) throw new Error("Unable to open print preview");
    frame.contentWindow.addEventListener("afterprint", () => frame.remove(), {
      once: true,
    });
    frame.contentWindow.focus();
    frame.contentWindow.print();
    window.setTimeout(() => frame.remove(), 300_000);
  } catch (error) {
    frame.remove();
    throw error;
  }
}
