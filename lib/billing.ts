import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getLaunchConfig } from "@/lib/launch-config";
import { requireVerifiedSender } from "@/lib/account";
import {
  checkoutBinding,
  parseSubscriptionSnapshot,
  safeProviderUrl,
  validateMonthlyPrice,
  validateCheckoutResponse,
  type BillingScope,
} from "@/lib/billing/helpers";
import { needsBillingManagement } from "@/lib/billing/checkout-state";
import type { SenderAccount } from "@/lib/account";

export class BillingError extends Error {
  constructor(message: string, public status = 503, public code = "billing_unavailable") {
    super(message);
    this.name = "BillingError";
  }
}

export type ProviderResource = {
  type: string;
  id: string;
  attributes: Record<string, unknown>;
  relationships?: Record<string, unknown>;
};

export function getBillingConfig() {
  const apiKey = process.env.LEMON_SQUEEZY_API_KEY;
  const storeId = process.env.LEMON_SQUEEZY_STORE_ID;
  const variantId = process.env.LEMON_SQUEEZY_VARIANT_ID;
  const webhookSecret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
  if (
    !apiKey ||
    !storeId ||
    !variantId ||
    !webhookSecret ||
    !/^\d+$/.test(storeId) ||
    !/^\d+$/.test(variantId)
  )
    throw new BillingError("Checkout is still being prepared. Please try later.", 503, "not_configured");
  return {
    apiKey,
    webhookSecret,
    storeId,
    variantId,
    testMode: process.env.LEMON_SQUEEZY_TEST_MODE === "true",
  } satisfies BillingScope & { apiKey: string; webhookSecret: string };
}

export function createBillingAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Billing database is not configured.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function lemonSqueezyRequest<T = { data: ProviderResource }>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const config = getBillingConfig();
  const response = await fetch(`https://api.lemonsqueezy.com/v1/${path}`, {
    method: init?.method || "GET",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
    },
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error(`Billing provider request failed (${response.status}).`);
  return response.json() as Promise<T>;
}

export async function createSenderCheckout() {
  if (!getLaunchConfig().checkoutEnabled)
    throw new BillingError("Pro checkout is not open yet. You can keep using Free.", 503, "checkout_closed");
  const config = getBillingConfig();
  const admin = createBillingAdminClient();
  const { supabase, user } = await requireVerifiedSender().catch(() => {
    throw new BillingError("Sign in with your verified email before continuing.", 401, "sign_in_required");
  });
  const { error: ensureError } = await supabase.rpc("ensure_sender_account");
  if (ensureError) throw new Error("Account setup is unavailable.");
  const { data: account, error: accountError } = await supabase.rpc("get_sender_account");
  if (accountError || !account) throw new BillingError("Your account is temporarily unavailable. Please try again.");
  if (needsBillingManagement(account as SenderAccount))
    throw new BillingError("This account already has a subscription. Open Manage billing from your account.", 409, "existing_subscription");
  const [prices, store] = await Promise.all([
    lemonSqueezyRequest<{ data: ProviderResource[] }>(
      `prices?filter[variant_id]=${config.variantId}&page[size]=1`,
    ),
    lemonSqueezyRequest(`stores/${config.storeId}`),
  ]);
  validateMonthlyPrice(prices.data[0], config);
  if (store.data.attributes.currency !== "USD")
    throw new Error("The Pro store must use USD pricing.");
  const { data: reservation, error } = await supabase.rpc(
    "reserve_sender_checkout",
  );
  if (error || !reservation?.reservation_id || !reservation?.expires_at) {
    if (error?.message?.includes("already being prepared"))
      throw new BillingError("A checkout is already being prepared for your account. Wait a moment before retrying. If you already paid, check your account instead.", 409, "checkout_pending");
    if (error?.message?.includes("existing subscription"))
      throw new BillingError("This account already has a subscription. Open Manage billing from your account.", 409, "existing_subscription");
    throw new BillingError("Pro is at capacity right now. No payment was taken by this request. Please try later.", 503, "capacity_unavailable");
  }
  if (reservation.checkout_url)
    return safeProviderUrl(reservation.checkout_url);
  try {
    const base = process.env.NEXT_PUBLIC_SITE_URL || "https://woff.space";
    const redirectUrl = new URL(
      "/checkout/complete",
      base,
    ).toString();
    const result = await lemonSqueezyRequest("checkouts", {
      method: "POST",
      body: {
        data: {
          type: "checkouts",
          attributes: {
            product_options: {
              enabled_variants: [Number(config.variantId)],
              redirect_url: redirectUrl,
              receipt_link_url: new URL("/checkout/complete", base).toString(),
              receipt_button_text: "Open sender account",
            },
            checkout_options: {
              embed: false,
              skip_trial: true,
              subscription_preview: true,
              button_color: "#ff5a00",
            },
            checkout_data: {
              email: user.email,
              custom: {
                user_id: user.id,
                reservation_id: reservation.reservation_id,
                account_signature: checkoutBinding(
                  user.id,
                  reservation.reservation_id,
                  config,
                  config.webhookSecret,
                ),
              },
            },
            test_mode: config.testMode,
            expires_at: reservation.expires_at,
          },
          relationships: {
            store: { data: { type: "stores", id: config.storeId } },
            variant: { data: { type: "variants", id: config.variantId } },
          },
        },
      },
    });
    const url = validateCheckoutResponse(result.data, config, reservation.expires_at);
    const { data: recorded, error: recordError } = await admin.rpc(
      "record_sender_checkout",
      {
        p_user_id: user.id,
        p_reservation_id: reservation.reservation_id,
        p_checkout_url: url,
      },
    );
    if (recordError || !recorded)
      throw new BillingError(
        "Checkout confirmation is unavailable. Please contact support before retrying.",
      );
    return url;
  } catch (error) {
    // If creation timed out the provider may have created a payable URL. Keep the
    // reservation until expiry, rather than admitting another paid sender early.
    throw error;
  }
}

export async function getSenderBillingPortal() {
  const config = getBillingConfig();
  const { supabase, user } = await requireVerifiedSender().catch(() => {
    throw new BillingError("Sign in to manage your subscription.", 401, "sign_in_required");
  });
  const { data: ent, error } = await supabase
    .from("sender_entitlements")
    .select("subscription_id, customer_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !ent?.subscription_id || !/^\d+$/.test(ent.subscription_id))
    throw new BillingError("No subscription is attached to this account.", 404, "no_subscription");
  const result = await lemonSqueezyRequest(
    `subscriptions/${ent.subscription_id}`,
  );
  const snapshot = parseSubscriptionSnapshot(result.data, config);
  if (snapshot.customerId !== ent.customer_id)
    throw new Error("Subscription identity could not be verified.");
  const urls = result.data.attributes.urls as
    | { customer_portal?: string }
    | undefined;
  return safeProviderUrl(urls?.customer_portal);
}
