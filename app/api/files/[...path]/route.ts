import { NextResponse } from "next/server";
import { requireAnonymousUser } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  if (!path?.length || path.some((part) => part === ".." || part.includes("\0"))) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const objectPath = path.map(decodeURIComponent).join("/");
  const spaceId = path[0];
  const { supabase } = await requireAnonymousUser();
  const { data: membership } = await supabase
    .from("space_members")
    .select("space_id")
    .eq("space_id", spaceId)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: asset } = await supabase
    .from("assets")
    .select("mime, entry:entries(expires_at)")
    .eq("bucket_key", objectPath)
    .maybeSingle();
  const mime = asset?.mime || "application/octet-stream";
  const entry = asset?.entry as { expires_at?: string | null } | null | undefined;
  const remainingSeconds = entry?.expires_at
    ? Math.floor((new Date(entry.expires_at).getTime() - Date.now()) / 1000)
    : 60;
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
  const { data, error } = await supabase.storage
    .from("files")
    .createSignedUrl(
      objectPath,
      signedUrlLifetime,
      safeInline ? undefined : { download: path[path.length - 1] },
    );
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const upstream = await fetch(data.signedUrl);
    if (upstream.ok && upstream.body) {
      const responseHeaders = new Headers();
      responseHeaders.set("Content-Type", mime);
      const contentLength = upstream.headers.get("content-length");
      if (contentLength) responseHeaders.set("Content-Length", contentLength);
      responseHeaders.set(
        "Cache-Control",
        `private, max-age=${Math.max(0, Math.min(3600, remainingSeconds))}`,
      );
      responseHeaders.set("X-Content-Type-Options", "nosniff");
      if (!safeInline) {
        responseHeaders.set(
          "Content-Disposition",
          `attachment; filename="${encodeURIComponent(path[path.length - 1])}"`,
        );
      }
      return new NextResponse(upstream.body, {
        status: 200,
        headers: responseHeaders,
      });
    }
  } catch {
    // If upstream fetch fails, fall back to redirect below
  }

  return NextResponse.redirect(data.signedUrl, {
    headers: {
      "Cache-Control": `private, max-age=${Math.max(0, Math.min(45, signedUrlLifetime - 1))}`,
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
