import { NextResponse } from "next/server";
import { getNote } from "@/lib/actions";

export async function GET(_req: Request, context: any) {
  try {
    const params = await Promise.resolve(context?.params);
    const slug = params?.slug as string | undefined;
    if (!slug) {
      return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    }

    const note = await getNote(slug);
    if (!note) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(note, { status: 200 });
  } catch (err) {
    console.error("/api/notes/[slug] error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
