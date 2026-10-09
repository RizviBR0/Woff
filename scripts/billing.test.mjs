import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  safeReturnPath,
  isVerifiedSender,
  hasOwnedRooms,
  requiresAccountTransfer,
  stageCookieWrites,
} from "../lib/account-helpers.ts";
import {
  verifyWebhookSignature,
  billingEventKey,
  checkoutBinding,
  verifyCheckoutBinding,
  parseSubscriptionSnapshot,
  subscriptionIdFromEvent,
  safeProviderUrl,
  validateMonthlyPrice,
  reconcileLatestInvoice,
  validateCheckoutResponse,
} from "../lib/billing/helpers.ts";
import { checkoutStatus, needsBillingManagement } from "../lib/billing/checkout-state.ts";

const scope = { storeId: "11", variantId: "22", testMode: false };
const userId = "2f9182d4-e411-4d44-8cf8-42d00bfe2294";
const reservationId = "ddf02cf4-a6ea-424f-bc9e-6f3c17adebed";
const subscription = (status = "active", extra = {}) => ({
  type: "subscriptions",
  id: "33",
  attributes: {
    store_id: 11,
    variant_id: 22,
    customer_id: 44,
    status,
    updated_at: "2026-10-04T01:00:00Z",
    renews_at: "2026-11-04T01:00:00Z",
    ends_at: "2026-10-20T01:00:00Z",
    test_mode: false,
    ...extra,
  },
});
const invoice = (extra = {}) => ({
  type: "subscription-invoices",
  id: "55",
  attributes: {
    store_id: 11,
    subscription_id: 33,
    customer_id: 44,
    status: "paid",
    refunded: false,
    updated_at: "2026-10-04T01:00:00Z",
    test_mode: false,
    ...extra,
  },
});
const price = (extra = {}) => ({
  type: "prices",
  attributes: {
    variant_id: 22,
    category: "subscription",
    scheme: "standard",
    unit_price: 800,
    renewal_interval_unit: "month",
    renewal_interval_quantity: 1,
    usage_aggregation: null,
    setup_fee_enabled: false,
    trial_interval_quantity: null,
    ...extra,
  },
});

test("auth accepts local paths and rejects external, malformed and encoded redirects", () => {
  assert.equal(
    safeReturnPath("/account?notice=ok#billing"),
    "/account?notice=ok#billing",
  );
  for (const path of [
    "https://evil.invalid",
    "//evil.invalid",
    "/\\evil.invalid",
    "/%2f%2fevil.invalid",
    "/%5cevil.invalid",
    "/%0aevil",
    "/%zz",
    "/auth/confirm",
    "\n/account",
  ])
    assert.equal(safeReturnPath(path), "/dashboard", path);
});
test("privileged sender requires confirmed email and a permanent user", () => {
  assert.equal(
    isVerifiedSender({
      email: "sender@example.invalid",
      email_confirmed_at: "date",
      is_anonymous: false,
    }),
    true,
  );
  for (const user of [
    null,
    { email: "sender@example.invalid", is_anonymous: false },
    {
      email: "sender@example.invalid",
      email_confirmed_at: "date",
      is_anonymous: true,
    },
    { email: "sender@example.invalid", email_confirmed_at: "date" },
  ])
    assert.equal(isVerifiedSender(user), false);
});
test("target session cookies remain staged until ownership succeeds; failure leaves guest intact", () => {
  const browser = new Map([["auth", "guest-session"]]);
  const stage = stageCookieWrites(
    [...browser].map(([name, value]) => ({ name, value })),
    (name, value) => browser.set(name, value),
  );
  stage.setAll([{ name: "auth", value: "verified-target", options: {} }]);
  assert.equal(browser.get("auth"), "guest-session");
  assert.equal(
    stage.getAll().find((cookie) => cookie.name === "auth").value,
    "verified-target",
  );
  stage.setAll([{ name: "auth", value: "refreshed-target", options: {} }]);
  stage.commit();
  assert.equal(browser.get("auth"), "refreshed-target");
  const failed = stageCookieWrites(
    [{ name: "auth", value: "guest-session" }],
    () => assert.fail("Failed transfer must not commit"),
  );
  failed.setAll([{ name: "auth", value: "unmerged-target", options: {} }]);
});
test("cross-device account links preserve an unrelated room owner's guest cookies without transfer proof", () => {
  const browser = new Map([["auth", "room-owner-session"]]);
  const stage = stageCookieWrites(
    [...browser].map(([name, value]) => ({ name, value })),
    (name, value) => browser.set(name, value),
  );
  stage.setAll([{ name: "auth", value: "different-account", options: {} }]);
  const source = {
    sourceUserId: "room-owner",
    targetUserId: "different-account",
    sourceOwnsRooms: hasOwnedRooms({ data: [{ id: "owned-room" }], error: null }),
    hasMergeTicket: false,
  };
  if (!requiresAccountTransfer(source)) stage.commit();
  assert.equal(browser.get("auth"), "room-owner-session");
  assert.equal(requiresAccountTransfer(source), true);
  assert.equal(
    requiresAccountTransfer({ ...source, targetUserId: "room-owner" }),
    false,
    "Email conversion of the original guest must keep working",
  );
  assert.equal(
    requiresAccountTransfer({ ...source, sourceUserId: undefined, sourceOwnsRooms: false }),
    false,
    "An empty new browser can sign in",
  );
  assert.equal(
    requiresAccountTransfer({ ...source, sourceOwnsRooms: false }),
    false,
    "A different guest with no owned rooms can sign in",
  );
  assert.equal(
    requiresAccountTransfer({ ...source, hasMergeTicket: true }),
    false,
    "An initiating ticket can proceed to existing server-side redemption",
  );
});
test("ownership lookup failures cannot be mistaken for an empty guest browser", () => {
  assert.equal(hasOwnedRooms({ data: [], error: null }), false);
  for (const result of [
    { data: [], error: { message: "RLS query unavailable" } },
    { data: null, error: null },
    { data: {}, error: null },
  ])
    assert.throws(() => hasOwnedRooms(result), /Could not verify/);
});
test("HMAC verifies exact raw UTF-8 body; rejects mutation and malformed signatures", () => {
  const body = '{"message":"hello 🌍"}';
  const signature = createHmac("sha256", "secret").update(body).digest("hex");
  assert.equal(verifyWebhookSignature(body, signature, "secret"), true);
  assert.equal(verifyWebhookSignature(`${body}\n`, signature, "secret"), false);
  for (const invalid of [
    null,
    "",
    "bad",
    "g".repeat(64),
    "a".repeat(63),
    "a".repeat(65),
  ])
    assert.equal(verifyWebhookSignature(body, invalid, "secret"), false);
});
test("event identity is stable for retries and different for distinct raw bodies", () => {
  assert.equal(billingEventKey('{"x":1}'), billingEventKey('{"x":1}'));
  assert.notEqual(billingEventKey('{"x":1}'), billingEventKey('{"x":2}'));
});
test("checkout binds server-selected sender, reservation, variant and live/test mode", () => {
  const signature = checkoutBinding(userId, reservationId, scope, "secret");
  assert.equal(
    verifyCheckoutBinding(userId, reservationId, signature, scope, "secret"),
    true,
  );
  assert.equal(
    verifyCheckoutBinding(
      userId,
      reservationId,
      signature,
      { ...scope, testMode: true },
      "secret",
    ),
    false,
  );
  assert.equal(
    verifyCheckoutBinding(
      userId,
      reservationId,
      signature,
      { ...scope, variantId: "999" },
      "secret",
    ),
    false,
  );
  assert.equal(
    verifyCheckoutBinding(
      userId,
      "edf02cf4-a6ea-424f-bc9e-6f3c17adebed",
      signature,
      scope,
      "secret",
    ),
    false,
  );
  assert.equal(
    verifyCheckoutBinding(null, reservationId, signature, scope, "secret"),
    false,
  );
});
test("subscription state rejects another store, variant, test mode or missing paid deadline", () => {
  for (const extra of [
    { store_id: 99 },
    { variant_id: 99 },
    { test_mode: true },
    { renews_at: null },
    { updated_at: "invalid" },
    { status: "unknown" },
  ])
    assert.throws(() =>
      parseSubscriptionSnapshot(subscription("active", extra), scope),
    );
});
test("active uses billing-cycle end; cancellation uses paid end; retries cannot advance access", () => {
  assert.equal(
    parseSubscriptionSnapshot(subscription(), scope).proUntil,
    "2026-11-04T01:00:00.000Z",
  );
  assert.equal(
    parseSubscriptionSnapshot(subscription("cancelled"), scope).proUntil,
    "2026-10-20T01:00:00.000Z",
  );
  for (const status of ["past_due", "unpaid", "expired", "paused", "on_trial"])
    assert.equal(
      parseSubscriptionSnapshot(subscription(status), scope).proUntil,
      null,
    );
});
test("subscription and invoice webhooks extract only numeric subscription identifiers", () => {
  assert.equal(subscriptionIdFromEvent({ data: subscription() }), "33");
  assert.equal(subscriptionIdFromEvent({ data: invoice() }), "33");
  assert.equal(
    subscriptionIdFromEvent({ data: { type: "orders", id: "33" } }),
    null,
  );
  assert.equal(
    subscriptionIdFromEvent({ data: { type: "subscriptions", id: "../evil" } }),
    null,
  );
});
test("latest full refund removes new premium access while a paid or partially refunded period remains", () => {
  const snapshot = parseSubscriptionSnapshot(subscription(), scope);
  const refunded = reconcileLatestInvoice(
    snapshot,
    invoice({
      status: "refunded",
      refunded: true,
      updated_at: "2026-10-05T01:00:00Z",
    }),
    scope,
  );
  assert.equal(refunded.status, "refunded");
  assert.equal(refunded.proUntil, null);
  assert.equal(
    refunded.capacityReserved,
    true,
    "refunded but still renewable subscriptions must retain promised capacity until cancelled",
  );
  assert.equal(refunded.updatedAt, "2026-10-05T01:00:00.000Z");
  assert.equal(
    reconcileLatestInvoice(
      snapshot,
      invoice({ status: "partial_refund" }),
      scope,
    ).status,
    "active",
  );
  assert.equal(
    reconcileLatestInvoice(snapshot, invoice(), scope).proUntil,
    snapshot.proUntil,
  );
});
test("renewable provider states retain capacity even after premium access stops", () => {
  for (const status of ["active", "past_due", "paused", "on_trial"])
    assert.equal(
      parseSubscriptionSnapshot(subscription(status), scope).capacityReserved,
      true,
    );
  for (const status of ["unpaid", "expired"])
    assert.equal(
      parseSubscriptionSnapshot(subscription(status), scope).capacityReserved,
      false,
    );
  assert.equal(
    parseSubscriptionSnapshot(
      subscription("cancelled", { ends_at: "2020-01-01T00:00:00Z" }),
      scope,
    ).capacityReserved,
    false,
  );
});
test("an unpaid invoice or invoice for another account cannot grant a paid subscription", () => {
  const snapshot = parseSubscriptionSnapshot(subscription(), scope);
  for (const extra of [
    { status: "pending" },
    { customer_id: 99 },
    { subscription_id: 99 },
    { test_mode: true },
    { store_id: 99 },
  ])
    assert.throws(() =>
      reconcileLatestInvoice(snapshot, invoice(extra), scope),
    );
});
test("checkout requires fixed $8 monthly price with no metered fees, setup fee or trial", () => {
  validateMonthlyPrice(price(), scope);
  for (const extra of [
    { unit_price: 900 },
    { renewal_interval_unit: "year" },
    { renewal_interval_quantity: 3 },
    { trial_interval_quantity: 7 },
    { setup_fee_enabled: true },
    { usage_aggregation: "sum" },
    { variant_id: 999 },
    { category: "one_time" },
  ])
    assert.throws(() => validateMonthlyPrice(price(extra), scope));
});
test("provider URLs must use HTTPS and an exact Lemon Squeezy hostname suffix", () => {
  assert.equal(
    safeProviderUrl("https://woff.lemonsqueezy.com/billing?signature=fixture"),
    "https://woff.lemonsqueezy.com/billing?signature=fixture",
  );
  for (const url of [
    "http://woff.lemonsqueezy.com",
    "https://lemonsqueezy.com.evil.invalid",
    "https://evil.invalid",
    "https://user:pass@woff.lemonsqueezy.com",
    "https://woff.lemonsqueezy.com:444/checkout",
    "/checkout",
  ])
    assert.throws(() => safeProviderUrl(url));
});

test("checkout response must match store, variant, payment mode and reserved lifetime", () => {
  const now = Date.parse("2026-10-06T12:00:00Z");
  const expires = "2026-10-06T12:30:00Z";
  const checkout = (extra = {}) => ({
    type: "checkouts",
    attributes: {
      store_id: 11, variant_id: 22, test_mode: false,
      expires_at: expires,
      url: "https://woff.lemonsqueezy.com/checkout/custom/example",
      ...extra,
    },
  });
  assert.equal(validateCheckoutResponse(checkout(), scope, expires, now), checkout().attributes.url);
  for (const extra of [
    { store_id: 99 }, { variant_id: 99 }, { test_mode: true },
    { expires_at: null }, { expires_at: "invalid" },
    { expires_at: "2026-10-06T12:00:00Z" },
    { expires_at: "2026-10-06T13:00:00Z" },
    { url: "https://attacker.invalid/checkout" },
  ]) assert.throws(() => validateCheckoutResponse(checkout(extra), scope, expires, now));
  assert.throws(() => validateCheckoutResponse(checkout(), scope, "invalid", now));
});

test("renewable and paid subscriptions use the portal; ended released subscriptions can purchase again", () => {
  assert.equal(needsBillingManagement({ is_pro: false, status: "free" }), false);
  for (const status of ["active", "cancelled", "paused", "past_due", "on_trial"])
    assert.equal(needsBillingManagement({ is_pro: false, status, subscription_id: "33" }), true);
  for (const status of ["expired", "unpaid", "refunded"]) {
    const account = { is_pro: false, status, subscription_id: "33", billing_capacity_reserved: false };
    assert.equal(needsBillingManagement(account), false);
    assert.equal(needsBillingManagement({ ...account, billing_capacity_reserved: true }), true);
    assert.equal(needsBillingManagement({ ...account, is_pro: true }), true);
  }
});

test("return status never calls a free account paid and distinguishes failed payment grace", () => {
  assert.deepEqual(checkoutStatus({ is_pro: false, status: "free" }), {
    state: "processing", hasSubscription: false, paidThrough: null,
  });
  assert.equal(checkoutStatus({ is_pro: false, status: "active", subscription_id: "33" }).state, "processing");
  for (const status of ["active", "cancelled"])
    assert.equal(checkoutStatus({ is_pro: true, status, subscription_id: "33" }).state, "active");
  for (const status of ["past_due", "unpaid", "paused", "refunded"])
    assert.equal(checkoutStatus({ is_pro: true, status, subscription_id: "33" }).state, "attention");
  assert.equal(checkoutStatus({ is_pro: false, status: "expired", subscription_id: "33" }).state, "inactive");
  assert.equal(checkoutStatus({ is_pro: true, status: "active", paid_through: "invalid" }).paidThrough, null);
});

test("cancelled return status recognizes elapsed paid access before an expiry webhook", () => {
  const now = Date.parse("2026-10-09T12:00:00Z");
  const account = { is_pro: false, status: "cancelled", subscription_id: "33" };
  for (const field of ["paid_through", "pro_until"]) {
    for (const deadline of ["2026-10-09T11:59:59Z", "2026-10-09T12:00:00Z"]) {
      assert.deepEqual(checkoutStatus({ ...account, [field]: deadline }, now), {
        state: "inactive", hasSubscription: true, paidThrough: deadline,
      });
    }
    const future = { ...account, [field]: "2026-10-09T12:00:01Z" };
    assert.equal(checkoutStatus(future, now).state, "processing");
    assert.equal(checkoutStatus({ ...future, is_pro: true }, now).state, "active");
    for (const deadline of [null, "invalid"])
      assert.equal(checkoutStatus({ ...account, [field]: deadline }, now).state, "processing");
  }
  assert.equal(checkoutStatus(account, now).state, "processing");
  assert.equal(checkoutStatus({ ...account, subscription_id: null, paid_through: "2026-10-09T11:59:59Z" }, now).state, "processing");
  assert.equal(checkoutStatus({ ...account, status: "unknown", paid_through: "2026-10-09T11:59:59Z" }, now).state, "processing");
});
