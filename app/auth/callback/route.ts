import { NextRequest, NextResponse } from "next/server";
import {
  createStagedAuthClient,
  finishAccountAuthentication,
} from "@/lib/account";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code && code.length < 2048) {
    const staged = await createStagedAuthClient();
    const { error } = await staged.supabase.auth.exchangeCodeForSession(code);
    if (!error)
      return finishAccountAuthentication(
        request.nextUrl.searchParams.get("next"),
        staged,
      );
  }
  return NextResponse.redirect(new URL("/sign-in?error=link", request.url));
}
