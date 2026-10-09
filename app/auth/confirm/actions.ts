"use server";

import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import {
  createStagedAuthClient,
  finishAccountAuthentication,
} from "@/lib/account";

export async function confirmEmailLink(form: FormData) {
  const token = String(form.get("token_hash") || "");
  const type = String(form.get("type") || "");
  if (
    !/^[a-zA-Z0-9_-]{20,256}$/.test(token) ||
    !["email", "magiclink", "email_change", "signup"].includes(type)
  )
    redirect("/sign-in?error=link");
  const staged = await createStagedAuthClient();
  const { error } = await staged.supabase.auth.verifyOtp({
    token_hash: token,
    type: type as EmailOtpType,
  });
  if (error) redirect("/sign-in?error=link");
  return finishAccountAuthentication(form.get("next"), staged);
}
