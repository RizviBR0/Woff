import { after, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAnonymousUser } from "@/lib/supabase";
import { canUseBoundedStorageRedirect } from "@/lib/storage-cache";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  if (
    !path?.length ||
    path.some((part) => part === ".." || part.includes("\0"))
  ) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }
  const objectPath = path.join("/");
  const { supabase } = await requireAnonymousUser();
  // RLS includes room expiry, revoked invitation grants and note privacy.
  const { data: asset } = await supabase
    .from("assets")
    .select("mime, entry:entries(space_id, expires_at)")
    .eq("bucket_key", objectPath)
    .maybeSingle();
  const entry = asset?.entry as unknown as {
    space_id: string;
    expires_at?: string | null;
  } | null;
  if (!asset || !entry || entry.space_id !== path[0]) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const { data: space } = await supabase
    .from("spaces")
    .select("expires_at, last_activity_at")
    .eq("id", entry.space_id)
    .maybeSingle();
  if (!space) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const roomDeadline = space.expires_at ? Date.parse(space.expires_at) : Infinity;
  const deadline = Math.min(
    roomDeadline,
    entry.expires_at ? Date.parse(entry.expires_at) : Infinity,
  );
  const seconds = Math.min(60, Math.floor((deadline - Date.now()) / 1000));
  if (!Number.isFinite(seconds) || seconds < 1)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey)
    return NextResponse.json(
      { error: "File delivery is not configured." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  // Browser roles cannot mint arbitrary-lived Storage links. User RLS above
  // authorizes this exact asset before the server issues a bounded capability.
  const storageAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const download = new URL(request.url).searchParams.get("download");
  const safeInline =
    /^(image\/(png|jpeg|gif|webp|avif)|application\/pdf|audio\/(mpeg|ogg|wav)|video\/(mp4|webm))$/i.test(
      asset.mime || "",
    );
  const filename = (download || path[path.length - 1])
    .replace(/[\r\n\x00-\x1f/\\]/g, "_");
  const boundedFilename = Array.from(filename).slice(0, 240).join("");
  if (download !== null)
    after(async () => {
      await supabase.rpc("record_room_event", {
        p_space_id: entry.space_id,
        p_event: "download_initiated",
      });
    });
  const { data: info, error: infoError } = await storageAdmin.storage.from("files").info(objectPath);
  if (infoError || !info) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!canUseBoundedStorageRedirect(info.cacheControl)) {
    // Legacy or externally uploaded files may have a long CDN/browser TTL.
    // Never expose another signed capability for those objects. Stream through
    // this authenticated route without buffering the file or forwarding keys.
    const headers: Record<string, string> = {
      Authorization: `Bearer ${serviceKey}`, apikey: serviceKey,
    };
    const range = request.headers.get("range");
    if (range && /^bytes=\d*-\d*$/.test(range)) headers.Range = range;
    let upstream: Response;
    try {
      upstream = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/authenticated/files/${path.map(encodeURIComponent).join("/")}`,
        { headers, cache: "no-store", redirect: "error", signal: request.signal },
      );
    } catch {
      return NextResponse.json({ error: "File delivery is temporarily unavailable" },
        { status: 503, headers: { "Cache-Control": "private, no-store" } });
    }
    if (!upstream.ok && upstream.status !== 416)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    const responseHeaders = new Headers({
      "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Content-Type": safeInline ? asset.mime : "application/octet-stream",
    });
    for (const header of ["content-length", "content-range", "accept-ranges"]) {
      const value = upstream.headers.get(header);
      if (value) responseHeaders.set(header, value);
    }
    if (download !== null || !safeInline) responseHeaders.set("Content-Disposition",
      `attachment; filename="${boundedFilename.replace(/[^\x20-\x7e]|["\\]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(boundedFilename).replace(/'/g, "%27")}`);
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  }
  const { data, error } = await storageAdmin.storage.from("files").createSignedUrl(objectPath, seconds);
  if (error || !data?.signedUrl) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const signedUrl = new URL(data.signedUrl);
  if (download !== null || !safeInline) signedUrl.searchParams.set("download", boundedFilename);
  // Transfer bytes directly from Storage; avoid a second server hop and support Range downloads.
  return NextResponse.redirect(signedUrl, {
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
