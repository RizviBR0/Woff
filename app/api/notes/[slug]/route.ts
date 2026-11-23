import { NextResponse } from "next/server";
import { getNote } from "@/lib/actions";

export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
} as const;

export async function GET(
  _req: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params;
    if (!slug || !/^[a-zA-Z0-9_-]{1,128}$/.test(slug)) {
      return NextResponse.json(
        { error: "Invalid slug" },
        { status: 400, headers: PRIVATE_HEADERS },
      );
    }

    const note = await getNote(slug);
    if (!note || (note.is_locked && !note.is_owner)) {
      return NextResponse.json(
        { error: "Not found" },
        { status: 404, headers: PRIVATE_HEADERS },
      );
    }

    return NextResponse.json(note, {
      status: 200,
      headers: PRIVATE_HEADERS,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: PRIVATE_HEADERS },
    );
  }
}
