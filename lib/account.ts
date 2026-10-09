import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getLaunchConfig } from "@/lib/launch-config";
import {
  authReturnPath,
  hasOwnedRooms,
  isVerifiedSender,
  requiresAccountTransfer,
  stageCookieWrites,
} from "@/lib/account-helpers";

export const MERGE_COOKIE = "woff_account_merge";
export const MERGE_PENDING_COOKIE = "woff_account_merge_pending";
export const AUTH_RETURN_COOKIE = "woff_auth_return";

/** Verify the target account without replacing the guest browser's cookies.
 * Commit only after its owned rooms have transferred successfully. */
export async function createStagedAuthClient() {
  const jar = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey)
    throw new Error("Account authentication is unavailable.");
  const stagedCookies = stageCookieWrites<CookieOptions>(
    jar.getAll(),
    (name, value, options) => jar.set(name, value, options),
  );
  const supabase = createServerClient(url, anonKey, { cookies: stagedCookies });
  const {
    data: { user: source },
    error: sourceError,
  } = await supabase.auth.getUser();
  if (sourceError && sourceError.name !== "AuthSessionMissingError")
    redirect("/sign-in?error=account-unavailable");
  if (source && jar.get(MERGE_PENDING_COOKIE) && !jar.get(MERGE_COOKIE))
    redirect("/sign-in?error=transfer-expired");
  // Read with the source session before verifying a link can replace it.
  let sourceOwnsRooms = false;
  if (source) {
    try {
      sourceOwnsRooms = hasOwnedRooms(
        await supabase
          .from("spaces")
          .select("id")
          .eq("creator_device_id", source.id)
          .limit(1),
      );
    } catch {
      redirect("/sign-in?error=account-unavailable");
    }
  }
  return {
    supabase,
    sourceUserId: source?.id,
    sourceOwnsRooms,
    commit: stagedCookies.commit,
  };
}

export type SenderAccount = {
  user_id: string;
  plan: "free" | "pro";
  status: string;
  is_pro: boolean;
  pro_until?: string | null;
  paid_through?: string | null;
  grace_until?: string | null;
  customer_id?: string | null;
  subscription_id?: string | null;
  billing_capacity_reserved?: boolean;
  storage_used_bytes: number;
  reserved_bytes?: number;
  storage_limit_bytes: number;
  active_room_count: number;
  active_room_limit: number;
};

export async function getAccountContext() {
  if (!getLaunchConfig().accountsEnabled)
    return { user: null, account: null, available: false };
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !isVerifiedSender(user))
      return { user, account: null, available: true };
    const { error: ensureError } = await supabase.rpc("ensure_sender_account");
    if (ensureError) return { user, account: null, available: false };
    const { data, error: accountError } =
      await supabase.rpc("get_sender_account");
    return {
      user,
      account: accountError ? null : (data as SenderAccount),
      available: !accountError,
    };
  } catch {
    return { user: null, account: null, available: false };
  }
}

export async function requireVerifiedSender() {
  if (!getLaunchConfig().accountsEnabled)
    throw new Error("Sender accounts are unavailable.");
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user || !isVerifiedSender(user))
    throw new Error("Verify your email before continuing.");
  return { supabase, user };
}

/** Called only after Supabase has verified the callback's email/code. */
export async function finishAccountAuthentication(
  next: unknown,
  staged?: Awaited<ReturnType<typeof createStagedAuthClient>>,
): Promise<never> {
  const supabase = staged?.supabase || (await createServerSupabaseClient());
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (
    userError ||
    !isVerifiedSender(user) ||
    !getLaunchConfig().accountsEnabled
  )
    redirect("/sign-in?error=link");
  const jar = await cookies();
  const ticket = jar.get(MERGE_COOKIE)?.value;
  if (
    staged &&
    requiresAccountTransfer({
      sourceUserId: staged.sourceUserId,
      targetUserId: user?.id,
      sourceOwnsRooms: staged.sourceOwnsRooms,
      hasMergeTicket: Boolean(ticket),
    })
  )
    redirect("/sign-in?error=transfer-required");
  const { error: ensureError } = await supabase.rpc("ensure_sender_account");
  if (ensureError) redirect("/sign-in?error=account-unavailable");
  const returnPath = authReturnPath(jar.get(AUTH_RETURN_COOKIE)?.value, next);
  if (ticket && staged?.sourceUserId !== user?.id) {
    const { error } = await supabase.rpc("redeem_account_merge_ticket", {
      p_token: ticket,
    });
    if (error) redirect("/sign-in?error=transfer-failed");
    staged?.commit();
    jar.delete({ name: MERGE_COOKIE, path: "/" });
    jar.delete({ name: MERGE_PENDING_COOKIE, path: "/" });
    jar.delete({ name: AUTH_RETURN_COOKIE, path: "/" });
    const destination = new URL(returnPath, "https://woff.invalid");
    destination.searchParams.set("notice", "rooms-recovered");
    redirect(`${destination.pathname}${destination.search}${destination.hash}`);
  }
  staged?.commit();
  jar.delete({ name: MERGE_COOKIE, path: "/" });
  jar.delete({ name: MERGE_PENDING_COOKIE, path: "/" });
  jar.delete({ name: AUTH_RETURN_COOKIE, path: "/" });
  redirect(returnPath);
}
