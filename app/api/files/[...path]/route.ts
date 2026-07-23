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
    .select("mime")
    .eq("bucket_key", objectPath)
    .maybeSingle();
  const mime = asset?.mime || "application/octet-stream";
  const safeInline =
    /^(image\/(png|jpeg|gif|webp|avif)|application\/pdf|audio\/|video\/)/i.test(
      mime,
    );
  const { data, error } = await supabase.storage
    .from("files")
    .createSignedUrl(
      objectPath,
      60,
      safeInline ? undefined : { download: path[path.length - 1] },
    );
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.redirect(data.signedUrl, {
    headers: {
      "Cache-Control": "private, max-age=45",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
