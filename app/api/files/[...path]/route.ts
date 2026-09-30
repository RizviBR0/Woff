import { NextResponse } from "next/server";
import { requireAnonymousUser } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  if (!path?.length || path.some((part) => part === ".." || part.includes("\0"))) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const objectPath = path.join("/");
  const spaceId = path[0];
  const { supabase } = await requireAnonymousUser();
  const [{ data: membership }, { data: asset }, { data: space }] = await Promise.all([
    supabase.from("space_members").select("space_id").eq("space_id", spaceId).maybeSingle(),
    supabase.from("assets").select("mime, entry:entries(space_id, expires_at)").eq("bucket_key", objectPath).maybeSingle(),
    supabase.from("spaces").select("is_pro, expires_at, last_activity_at").eq("id", spaceId).maybeSingle(),
  ]);

  if (!membership || !asset || !space) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const mime = asset?.mime || "application/octet-stream";
  const entry = asset.entry as unknown as { space_id: string; expires_at?: string | null } | null;
  if (!entry || entry.space_id !== spaceId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const roomDeadline = space.is_pro ? Infinity : space.expires_at
    ? new Date(space.expires_at).getTime()
    : new Date(space.last_activity_at).getTime() + 48 * 60 * 60 * 1000;
  const fileDeadline = entry.expires_at ? new Date(entry.expires_at).getTime() : Infinity;
  const remainingSeconds = Math.floor((Math.min(roomDeadline, fileDeadline, Date.now() + 60_000) - Date.now()) / 1000);
  if (remainingSeconds <= 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // A signed link minted just before an extension file expires must not remain
  // usable beyond that file's server-enforced deadline.
  const signedUrlLifetime = Math.max(1, Math.min(60, remainingSeconds));
  const safeInline =
    /^(image\/(png|jpeg|gif|webp|avif)|application\/pdf|audio\/|video\/)/i.test(
      mime,
    );
  const download = new URL(request.url).searchParams.get("download");
  const filename = (download || path[path.length - 1]).replace(/[\r\n\x00-\x1f/\\]/g, "_").slice(0, 240);
  const { data, error } = await supabase.storage
    .from("files")
    .createSignedUrl(
      objectPath,
      signedUrlLifetime,
    );
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Append once with URLSearchParams: this storage-js version runs encodeURI
  // after encoding query parameters, which otherwise doubles filename escapes.
  const signedUrl = new URL(data.signedUrl);
  if (download !== null || !safeInline) signedUrl.searchParams.set("download", filename);
  if (download !== null) {
    return NextResponse.redirect(signedUrl, { headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    } });
  }

  try {
    const range = request.headers.get("range");
    const upstream = await fetch(signedUrl, { headers: range ? { Range: range } : undefined, cache: "no-store" });
    if (upstream.ok && upstream.body) {
      const responseHeaders = new Headers();
      responseHeaders.set("Content-Type", mime);
      const contentLength = upstream.headers.get("content-length");
      if (contentLength) responseHeaders.set("Content-Length", contentLength);
      for (const name of ["content-range", "accept-ranges"]) {
        const value = upstream.headers.get(name);
        if (value) responseHeaders.set(name, value);
      }
      responseHeaders.set(
        "Cache-Control",
        `private, max-age=${Math.max(0, Math.min(3600, remainingSeconds))}`,
      );
      responseHeaders.set("X-Content-Type-Options", "nosniff");
      if (!safeInline || download !== null) {
        responseHeaders.set(
          "Content-Disposition",
          `attachment; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)}`,
        );
      }
      return new NextResponse(upstream.body, {
        status: upstream.status,
        headers: responseHeaders,
      });
    }
    return NextResponse.json({ error: "File unavailable" }, { status: upstream.status === 416 ? 416 : 404 });
  } catch {
    // If upstream fetch fails, fall back to redirect below
  }

  return NextResponse.redirect(signedUrl, {
    headers: {
      "Cache-Control": `private, max-age=${Math.max(0, Math.min(45, signedUrlLifetime - 1))}`,
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
