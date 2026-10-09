import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as helpers from "../lib/billing/helpers.ts";
import * as checkoutState from "../lib/billing/checkout-state.ts";
import { isVerifiedSender } from "../lib/account-helpers.ts";

// Run actual handlers with deterministic provider/database adapters. No network,
// merchant credentials, payments, or production account mutations are involved.
function load(path, adapters, globals = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exported = {};
  vm.runInNewContext(outputText, { exports: exported, URL, AbortSignal,
    require(name) { assert.ok(name in adapters, `Unexpected dependency ${name}`); return adapters[name]; },
    ...globals,
  });
  return exported;
}

function fixture(options = {}) {
  const calls = [];
  const user = { id: "2f9182d4-e411-4d44-8cf8-42d00bfe2294", email: "sender@example.invalid" };
  const reservation = {
    reservation_id: "ddf02cf4-a6ea-424f-bc9e-6f3c17adebed",
    expires_at: new Date(Date.now() + 1_800_000).toISOString(),
    ...options.reservation,
  };
  const account = { is_pro: false, status: "free", ...options.account };
  const url = "https://woff.lemonsqueezy.com/checkout/custom/fixture";
  const supabase = { rpc: async (name, args) => {
    calls.push({ kind: "rpc", name, args });
    if (name === "get_sender_account") return { data: account, error: options.accountError };
    if (name === "reserve_sender_checkout") return { data: reservation, error: options.reserveError };
    return { data: true, error: null };
  } };
  const admin = { rpc: async (name, args) => {
    calls.push({ kind: "admin", name, args });
    return { data: !options.recordError, error: options.recordError };
  } };
  const fetch = async (requestUrl, init) => {
    const path = new URL(requestUrl).pathname;
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ kind: "provider", path, body });
    if (path.endsWith("/prices")) return Response.json({ data: [{ type: "prices", attributes: {
      variant_id: 22, category: "subscription", scheme: "standard", unit_price: options.price ?? 800,
      renewal_interval_unit: "month", renewal_interval_quantity: 1,
    } }] });
    if (path.endsWith("/stores/11")) return Response.json({ data: { attributes: { currency: "USD" } } });
    if (path.endsWith("/checkouts")) {
      if (options.timeout) throw new Error("provider timeout");
      return Response.json({ data: { type: "checkouts", attributes: {
        url, store_id: 11, variant_id: 22, test_mode: options.testMode === true,
        expires_at: reservation.expires_at, ...options.providerCheckout,
      } } });
    }
    throw new Error(`Unexpected request ${path}`);
  };
  const billing = load("../lib/billing.ts", {
    "server-only": {},
    "@supabase/supabase-js": { createClient: () => admin },
    "@/lib/launch-config": { getLaunchConfig: () => ({ checkoutEnabled: options.enabled !== false }) },
    "@/lib/account": { requireVerifiedSender: async () => {
      if (options.signedOut) throw new Error("not signed in");
      return { user, supabase };
    } },
    "@/lib/billing/helpers": helpers,
    "@/lib/billing/checkout-state": checkoutState,
  }, { fetch, process: { env: {
    LEMON_SQUEEZY_API_KEY: "fixture-only", LEMON_SQUEEZY_STORE_ID: "11",
    LEMON_SQUEEZY_VARIANT_ID: "22", LEMON_SQUEEZY_WEBHOOK_SECRET: "fixture-signing-secret",
    LEMON_SQUEEZY_TEST_MODE: options.testMode === true ? "true" : "false", NEXT_PUBLIC_SITE_URL: "https://woff.space",
    NEXT_PUBLIC_SUPABASE_URL: "https://database.example.invalid", SUPABASE_SERVICE_ROLE_KEY: "fixture-only",
  } } });
  return { billing, calls, reservation, user, url };
}

test("checkout creates a reserved provider URL tied to the verified owner and configured price", async () => {
  const f = fixture();
  assert.equal(await f.billing.createSenderCheckout(), f.url);
  const request = f.calls.find(c => c.path?.endsWith("/checkouts")).body.data;
  assert.equal(request.relationships.variant.data.id, "22");
  assert.equal(request.attributes.test_mode, false);
  assert.equal(request.attributes.expires_at, f.reservation.expires_at);
  assert.equal(request.attributes.product_options.redirect_url, "https://woff.space/checkout/complete");
  const custom = request.attributes.checkout_data.custom;
  assert.equal(custom.user_id, f.user.id);
  assert.equal(helpers.verifyCheckoutBinding(custom.user_id, custom.reservation_id, custom.account_signature,
    { storeId: "11", variantId: "22", testMode: false }, "fixture-signing-secret"), true);
  const record = f.calls.find(c => c.kind === "admin");
  assert.equal(record.name, "record_sender_checkout");
  assert.equal(record.args.p_user_id, f.user.id);
  assert.equal(record.args.p_checkout_url, f.url);
});

test("test checkout requests test mode and binds confirmation to that mode", async () => {
  const f = fixture({ testMode: true });
  assert.equal(await f.billing.createSenderCheckout(), f.url);
  const request = f.calls.find(call => call.path?.endsWith("/checkouts")).body.data;
  assert.equal(request.attributes.test_mode, true);
  const custom = request.attributes.checkout_data.custom;
  assert.equal(helpers.verifyCheckoutBinding(custom.user_id, custom.reservation_id, custom.account_signature,
    { storeId: "11", variantId: "22", testMode: true }, "fixture-signing-secret"), true);
  assert.equal(helpers.verifyCheckoutBinding(custom.user_id, custom.reservation_id, custom.account_signature,
    { storeId: "11", variantId: "22", testMode: false }, "fixture-signing-secret"), false);
});

test("test checkout rejects a provider response in live mode", async () => {
  const f = fixture({ testMode: true, providerCheckout: { test_mode: false } });
  await assert.rejects(f.billing.createSenderCheckout());
  assert.equal(f.calls.filter(call => call.kind === "admin").length, 0);
});

test("checkout closed or signed-out requests never reach the provider", async () => {
  for (const [options, code] of [[{ enabled: false }, "checkout_closed"], [{ signedOut: true }, "sign_in_required"]]) {
    const f = fixture(options);
    await assert.rejects(f.billing.createSenderCheckout(), error => error.code === code);
    assert.equal(f.calls.length, 0);
  }
});

test("renewable and paid accounts cannot create a duplicate subscription", async () => {
  for (const account of [
    { is_pro: true, status: "active", subscription_id: "33" },
    { status: "refunded", subscription_id: "33", billing_capacity_reserved: true },
  ]) {
    const f = fixture({ account });
    await assert.rejects(f.billing.createSenderCheckout(), error => error.code === "existing_subscription");
    assert.equal(f.calls.filter(c => c.kind === "provider").length, 0);
  }
});

test("an ended released subscription can create a new reserved checkout", async () => {
  const f = fixture({ account: { status: "expired", subscription_id: "33", billing_capacity_reserved: false } });
  assert.equal(await f.billing.createSenderCheckout(), f.url);
});

test("repeat requests reuse the recorded checkout without another provider create", async () => {
  const url = "https://woff.lemonsqueezy.com/checkout/custom/existing";
  const f = fixture({ reservation: { checkout_url: url } });
  assert.equal(await f.billing.createSenderCheckout(), url);
  assert.equal(f.calls.some(c => c.path?.endsWith("/checkouts")), false);
  assert.equal(f.calls.some(c => c.kind === "admin"), false);
});

test("unsupported price and capacity denial stop before a payable checkout", async () => {
  for (const options of [{ price: 900 }, { reserveError: { message: "Pro pilot is full" } }, { reserveError: { message: "Checkout is already being prepared" } }]) {
    const f = fixture(options);
    await assert.rejects(f.billing.createSenderCheckout());
    assert.equal(f.calls.some(c => c.path?.endsWith("/checkouts")), false);
  }
});

test("ambiguous creation and invalid provider replies never release capacity or expose an unrecorded URL", async () => {
  for (const options of [
    { timeout: true }, { providerCheckout: { variant_id: 99 } },
    { providerCheckout: { test_mode: true } }, { recordError: { message: "database unavailable" } },
  ]) {
    const f = fixture(options);
    await assert.rejects(f.billing.createSenderCheckout());
    assert.equal(f.calls.some(c => c.name === "release_sender_checkout"), false);
  }
});

test("checkout HTTP route rejects foreign origin and does not leak provider errors", async () => {
  const f = fixture();
  let invoked = 0;
  const { POST } = load("../app/api/billing/checkout/route.ts", {
    "next/server": { NextResponse: Response },
    "@/lib/billing": { BillingError: f.billing.BillingError, createSenderCheckout: async () => {
      invoked++; throw new Error("sensitive provider response");
    } },
  });
  const foreign = await POST({ headers: new Headers({ origin: "https://other.example" }), nextUrl: new URL("https://woff.space/api/billing/checkout") });
  assert.equal(foreign.status, 403);
  assert.equal(invoked, 0);
  const accepted = await POST({ headers: new Headers({ origin: "https://woff.space" }), nextUrl: new URL("https://woff.space/api/billing/checkout") });
  assert.equal(accepted.status, 503);
  assert.equal(accepted.headers.get("cache-control"), "private, no-store");
  assert.equal((await accepted.text()).includes("sensitive"), false);
});

test("payment-status API uses trusted account state, requires verification, and never caches", async () => {
  const verified = { email: "sender@example.invalid", email_confirmed_at: "2026-10-06", is_anonymous: false };
  for (const [context, status, expected] of [
    [{ available: true, user: null, account: null }, 401, null],
    [{ available: false, user: verified, account: null }, 503, null],
    [{ available: true, user: verified, account: { is_pro: false, status: "free" } }, 200, "processing"],
    [{ available: true, user: verified, account: { is_pro: true, status: "active", subscription_id: "33" } }, 200, "active"],
  ]) {
    const { GET } = load("../app/api/billing/status/route.ts", {
      "next/server": { NextResponse: Response },
      "@/lib/account": { getAccountContext: async () => context },
      "@/lib/account-helpers": { isVerifiedSender },
      "@/lib/billing/checkout-state": checkoutState,
    });
    const response = await GET(new Request("https://woff.space/api/billing/status?paid=true&user=someone-else"));
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    if (expected) assert.equal((await response.json()).state, expected);
  }
});
