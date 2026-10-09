"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getLaunchConfig } from "@/lib/launch-config";
import { isVerifiedSender, safeReturnPath } from "@/lib/account-helpers";
import {
  AUTH_RETURN_COOKIE,
  MERGE_COOKIE,
  MERGE_PENDING_COOKIE,
} from "@/lib/account";

export type SignInState = { ok?: boolean; message?: string; email?: string };

export async function sendSignInEmail(
  _previous: SignInState,
  form: FormData,
): Promise<SignInState> {
  const config = getLaunchConfig();
  if (!config.accountsEnabled || !config.emailDeliveryVerified)
    return {
      message:
        "Email sign-in is being prepared. Your current rooms still work in this browser.",
    };
  const email = String(form.get("email") || "")
    .trim()
    .toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { message: "Enter a valid email address." };
  const mode = form.get("mode") === "existing" ? "existing" : "link";
  const next = safeReturnPath(form.get("next"));
  const requestHeaders = await headers();
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.NODE_ENV !== "production"
      ? requestHeaders.get("origin")
      : "https://woff.space");
  if (!origin)
    return { message: "Email sign-in is unavailable. Please try again later." };
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("next", next);
  try {
    const supabase = await createServerSupabaseClient();
    let {
      data: { user },
      error: identityError,
    } = await supabase.auth.getUser();
    if (identityError && identityError.name !== "AuthSessionMissingError")
      return {
        message: "We could not verify this browser's session. Your rooms are still here. Please try again.",
      };
    if (isVerifiedSender(user))
      return {
        message: "You are already signed in. Open your account to continue.",
      };
    const jar = await cookies();
    const rememberDestination = () =>
      jar.set(AUTH_RETURN_COOKIE, next, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 3600,
      });
    if (mode === "existing") {
      if (user) {
        const { data: ticket, error } = await supabase.rpc(
          "create_account_merge_ticket",
        );
        if (
          error ||
          typeof ticket !== "string" ||
          !/^[a-f0-9]{64}$/.test(ticket)
        )
          return {
            message:
              "We could not protect your browser's rooms. Try again before switching accounts.",
          };
        jar.set(MERGE_COOKIE, ticket, {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 600,
        });
        jar.set(MERGE_PENDING_COOKIE, "existing", {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 3600,
        });
      }
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: callback.toString(),
        },
      });
      if (error && error.status === 429)
        return { message: "Please wait before requesting another email." };
      if (error && error.status !== 400 && error.status !== 422)
        return { message: "Email could not be sent. Please try again later." };
      if (!error) rememberDestination();
      return {
        ok: true,
        email,
        message:
          "If this email has an account, a sign-in link is on its way. Open it in this browser within 10 minutes to recover this browser's rooms.",
      };
    }
    jar.delete({ name: MERGE_COOKIE, path: "/" });
    jar.delete({ name: MERGE_PENDING_COOKIE, path: "/" });
    if (!user) {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error || !data.user)
        return {
          message: "We could not prepare your account. Refresh and try again.",
        };
      user = data.user;
    }
    const { error } = await supabase.auth.updateUser(
      { email },
      { emailRedirectTo: callback.toString() },
    );
    if (error)
      return {
        message:
          error.status === 429
            ? "Please wait before requesting another email."
            : "We could not link this email. If it already has an account, use the Sign in page. Your browser's rooms are still here.",
      };
    rememberDestination();
    return {
      ok: true,
      email,
      message:
        "Check your email to verify your account. Open the link in this browser to keep your rooms attached.",
    };
  } catch {
    return {
      message:
        "Email sign-in is unavailable. Your current rooms still work in this browser.",
    };
  }
}

export async function signOutAccount() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut({ scope: "local" });
  (await cookies()).delete({ name: MERGE_COOKIE, path: "/" });
  (await cookies()).delete({ name: MERGE_PENDING_COOKIE, path: "/" });
  (await cookies()).delete({ name: AUTH_RETURN_COOKIE, path: "/" });
  redirect("/sign-in");
}
