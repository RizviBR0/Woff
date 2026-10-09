import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type BillingScope = {
  storeId: string;
  variantId: string;
  testMode: boolean;
};
export type SubscriptionSnapshot = {
  id: string;
  customerId: string;
  status: string;
  updatedAt: string;
  proUntil: string | null;
  testMode: boolean;
  capacityReserved: boolean;
};

export const SUPPORTED_BILLING_EVENTS = new Set([
  "subscription_created",
  "subscription_updated",
  "subscription_cancelled",
  "subscription_resumed",
  "subscription_expired",
  "subscription_paused",
  "subscription_unpaused",
  "subscription_payment_success",
  "subscription_payment_failed",
  "subscription_payment_recovered",
  "subscription_payment_refunded",
]);

export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!secret || !signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

export function billingEventKey(rawBody: string): string {
  return createHash("sha256").update(rawBody, "utf8").digest("hex");
}

export function checkoutBinding(
  userId: string,
  reservationId: string,
  scope: BillingScope,
  secret: string,
): string {
  return createHmac("sha256", secret)
    .update(
      `woff-checkout-v1|${userId}|${reservationId}|${scope.storeId}|${scope.variantId}|${scope.testMode}`,
    )
    .digest("hex");
}

export function verifyCheckoutBinding(
  userId: unknown,
  reservationId: unknown,
  signature: unknown,
  scope: BillingScope,
  secret: string,
): boolean {
  if (
    typeof userId !== "string" ||
    !/^[a-f0-9-]{36}$/i.test(userId) ||
    typeof reservationId !== "string" ||
    !/^[a-f0-9-]{36}$/i.test(reservationId) ||
    typeof signature !== "string" ||
    !/^[a-f0-9]{64}$/i.test(signature)
  )
    return false;
  return timingSafeEqual(
    Buffer.from(checkoutBinding(userId, reservationId, scope, secret), "hex"),
    Buffer.from(signature, "hex"),
  );
}

export function safeProviderUrl(value: unknown): string {
  if (typeof value !== "string")
    throw new Error("Provider did not return a URL.");
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    !(
      url.hostname === "lemonsqueezy.com" ||
      url.hostname.endsWith(".lemonsqueezy.com")
    )
  )
    throw new Error("Provider returned an unexpected URL.");
  return url.toString();
}

/** Never send a customer to a checkout for another variant or payment mode. */
export function validateCheckoutResponse(
  resource: unknown,
  scope: BillingScope,
  reservationExpiresAt: string,
  now = Date.now(),
): string {
  const item = resource as {
    type?: string;
    attributes?: Record<string, unknown>;
  } | null;
  const attr = item?.attributes;
  const expectedDeadline = Date.parse(reservationExpiresAt);
  const deadline = typeof attr?.expires_at === "string" ? Date.parse(attr.expires_at) : NaN;
  if (
    item?.type !== "checkouts" || !attr ||
    String(attr.store_id) !== scope.storeId ||
    String(attr.variant_id) !== scope.variantId ||
    attr.test_mode !== scope.testMode ||
    !Number.isFinite(expectedDeadline) || !Number.isFinite(deadline) ||
    deadline <= now || deadline > expectedDeadline + 1000
  ) throw new Error("Checkout identity or expiration could not be verified.");
  return safeProviderUrl(attr.url);
}

export function parseSubscriptionSnapshot(
  resource: unknown,
  scope: BillingScope,
): SubscriptionSnapshot {
  const item = resource as {
    type?: string;
    id?: string;
    attributes?: Record<string, unknown>;
  } | null;
  const attr = item?.attributes;
  if (item?.type !== "subscriptions" || !/^\d+$/.test(String(item.id)) || !attr)
    throw new Error("Invalid subscription response.");
  if (
    String(attr.store_id) !== scope.storeId ||
    String(attr.variant_id) !== scope.variantId ||
    attr.test_mode !== scope.testMode
  )
    throw new Error("Subscription is outside the configured billing scope.");
  const status = String(attr.status);
  if (
    ![
      "active",
      "on_trial",
      "paused",
      "past_due",
      "unpaid",
      "cancelled",
      "expired",
    ].includes(status)
  )
    throw new Error("Unsupported subscription status.");
  if (
    !/^\d+$/.test(String(attr.customer_id)) ||
    typeof attr.updated_at !== "string" ||
    !Number.isFinite(Date.parse(attr.updated_at))
  )
    throw new Error("Invalid subscription identity or timestamp.");
  // A retry's renews_at is not a paid billing period. Preserve stored paid-through in SQL.
  const value =
    status === "active"
      ? attr.renews_at
      : status === "cancelled"
        ? attr.ends_at
        : null;
  const proUntil =
    typeof value === "string" && Number.isFinite(Date.parse(value))
      ? new Date(value).toISOString()
      : null;
  if ((status === "active" || status === "cancelled") && !proUntil)
    throw new Error("Paid subscription has no bounded access deadline.");
  return {
    id: String(item.id),
    customerId: String(attr.customer_id),
    status,
    updatedAt: new Date(attr.updated_at).toISOString(),
    proUntil,
    testMode: scope.testMode,
    capacityReserved:
      ["active", "on_trial", "paused", "past_due"].includes(status) ||
      (status === "cancelled" && Date.parse(proUntil || "") > Date.now()),
  };
}

export function subscriptionIdFromEvent(payload: unknown): string | null {
  const data = (
    payload as {
      data?: {
        type?: string;
        id?: unknown;
        attributes?: Record<string, unknown>;
      };
    }
  )?.data;
  const id =
    data?.type === "subscriptions"
      ? data.id
      : data?.type === "subscription-invoices"
        ? data.attributes?.subscription_id
        : null;
  return /^\d+$/.test(String(id)) ? String(id) : null;
}

export function validateMonthlyPrice(
  resource: unknown,
  scope: BillingScope,
): void {
  const item = resource as {
    type?: string;
    attributes?: Record<string, unknown>;
  } | null;
  const a = item?.attributes;
  if (
    item?.type !== "prices" ||
    !a ||
    String(a.variant_id) !== scope.variantId ||
    a.category !== "subscription" ||
    a.scheme !== "standard" ||
    a.unit_price !== 800 ||
    a.renewal_interval_unit !== "month" ||
    a.renewal_interval_quantity !== 1 ||
    a.usage_aggregation ||
    a.setup_fee_enabled ||
    a.trial_interval_quantity
  )
    throw new Error(
      "The configured Pro variant must be $8 monthly, without trial or setup fee.",
    );
}

/** Full refund of the latest invoice ends new Pro access. Historical refunds do
 * not override a later paid invoice; partial refunds retain the paid period. */
export function reconcileLatestInvoice(
  snapshot: SubscriptionSnapshot,
  resource: unknown,
  scope: BillingScope,
): SubscriptionSnapshot {
  const item = resource as {
    type?: string;
    attributes?: Record<string, unknown>;
  } | null;
  const a = item?.attributes;
  if (
    !a ||
    item?.type !== "subscription-invoices" ||
    String(a.subscription_id) !== snapshot.id ||
    String(a.customer_id) !== snapshot.customerId ||
    String(a.store_id) !== scope.storeId ||
    a.test_mode !== scope.testMode ||
    typeof a.updated_at !== "string" ||
    !Number.isFinite(Date.parse(a.updated_at))
  )
    throw new Error("Invoice identity could not be verified.");
  const updatedAt = new Date(
    Math.max(Date.parse(snapshot.updatedAt), Date.parse(a.updated_at)),
  ).toISOString();
  if (a.refunded === true || a.status === "refunded")
    return { ...snapshot, status: "refunded", proUntil: null, updatedAt };
  if (
    (snapshot.status === "active" || snapshot.status === "cancelled") &&
    a.status !== "paid" &&
    a.status !== "partial_refund"
  )
    throw new Error("A paid invoice is required for Pro access.");
  return { ...snapshot, updatedAt };
}
