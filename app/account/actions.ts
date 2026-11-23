"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  AUTH_RETURN_COOKIE,
  MERGE_COOKIE,
  MERGE_PENDING_COOKIE,
  requireVerifiedSender,
} from "@/lib/account";

export async function retryAccountMerge() {
  const { supabase } = await requireVerifiedSender();
  const jar = await cookies();
  const token = jar.get(MERGE_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    jar.delete({ name: MERGE_COOKIE, path: "/" });
    jar.delete({ name: MERGE_PENDING_COOKIE, path: "/" });
    redirect("/account?notice=merge-expired");
  }
  const { error } = await supabase.rpc("redeem_account_merge_ticket", {
    p_token: token,
  });
  if (error) redirect("/account?notice=merge-failed");
  jar.delete({ name: MERGE_COOKIE, path: "/" });
  jar.delete({ name: MERGE_PENDING_COOKIE, path: "/" });
  jar.delete({ name: AUTH_RETURN_COOKIE, path: "/" });
  redirect("/dashboard?notice=rooms-recovered");
}
