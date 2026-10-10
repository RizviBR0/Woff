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

function pollingFixture(fetchStatus, visible = true) {
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  const statuses = [];
  const finished = [];
  const requests = [];
  class ClockDate extends Date { static now() { return now; } }
  const polling = load("../lib/billing/poll-checkout-status.ts", {}, {
    Date: ClockDate,
    AbortController,
    setTimeout: (callback, delay) => {
      const id = ++nextId;
      timers.set(id, { at: now + delay, callback });
      return id;
    },
    clearTimeout: id => timers.delete(id),
    fetch: (url, init) => {
      requests.push({ url, init });
      return fetchStatus(requests.length);
    },
  });
  const start = () => polling.pollCheckoutStatus({
    onStatus: status => statuses.push(status),
    onFinish: result => finished.push(result),
    isVisible: () => visible,
  });
  const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  const advance = async ms => {
    await settle();
    const target = now + ms;
    while (true) {
      const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > target) break;
      now = next[1].at;
      timers.delete(next[0]);
      next[1].callback();
      await settle();
    }
    now = target;
    await settle();
  };
  return { start, advance, settle, statuses, finished, requests, timers, timeout: polling.CHECKOUT_CHECK_TIMEOUT_MS };
}

const statusReply = (state = "processing") => ({
  ok: true, status: 200,
  json: async () => ({ state, hasSubscription: state !== "processing", paidThrough: null }),
});

test("confirmation polling ends at its deadline when the account remains unconfirmed", async () => {
  const f = pollingFixture(() => statusReply());
  f.start();
  await f.advance(f.timeout);
  assert.equal(f.finished.length, 1);
  assert.equal(f.finished[0].kind, "pending");
  assert.equal(f.timers.size, 0);
  const count = f.requests.length;
  await f.advance(60_000);
  assert.equal(f.requests.length, count);
});

test("active, ended and billing-attention responses immediately end loading", async () => {
  for (const state of ["active", "inactive", "attention"]) {
    const f = pollingFixture(() => statusReply(state));
    f.start();
    await f.settle();
    assert.equal(f.statuses[0].state, state);
    assert.equal(f.finished[0].kind, "complete");
    assert.equal(f.timers.size, 0);
    await f.advance(30_000);
    assert.equal(f.requests.length, 1);
  }
});

test("a stalled request is aborted and finishes even when fetch ignores cancellation", async () => {
  let resolve;
  const f = pollingFixture(() => new Promise(done => { resolve = done; }));
  f.start();
  await f.advance(8_000);
  assert.equal(f.finished[0].kind, "error");
  assert.match(f.finished[0].message, /timed out/);
  assert.equal(f.requests[0].init.signal.aborted, true);
  resolve(statusReply("active"));
  await f.settle();
  assert.equal(f.statuses.length, 0);
  assert.equal(f.finished.length, 1);
  assert.equal(f.timers.size, 0);
});

test("a stalled response body cannot leave the account check loading", async () => {
  const f = pollingFixture(() => ({ ok: true, status: 200, json: () => new Promise(() => {}) }));
  f.start();
  await f.advance(8_000);
  assert.equal(f.finished[0].kind, "error");
  assert.equal(f.requests[0].init.signal.aborted, true);
  assert.equal(f.timers.size, 0);
});

test("the overall deadline also aborts a request that started near the end of polling", async () => {
  const f = pollingFixture(count => count < 5 ? statusReply() : new Promise(() => {}));
  f.start();
  await f.advance(f.timeout);
  assert.equal(f.finished[0].kind, "pending");
  assert.equal(f.requests.length, 5);
  assert.equal(f.requests.at(-1).init.signal.aborted, true);
  assert.equal(f.timers.size, 0);
});

test("a hidden page still reaches the overall deadline without making requests", async () => {
  const f = pollingFixture(() => assert.fail("Hidden page must not poll"), false);
  f.start();
  await f.advance(f.timeout);
  assert.equal(f.finished[0].kind, "pending");
  assert.equal(f.requests.length, 0);
  assert.equal(f.timers.size, 0);
});

test("a fresh retry can confirm payment after a previous request timed out", async () => {
  const f = pollingFixture(count => count === 1 ? new Promise(() => {}) : statusReply("active"));
  f.start();
  await f.advance(8_000);
  assert.equal(f.finished[0].kind, "error");
  f.start();
  await f.settle();
  assert.equal(f.statuses[0].state, "active");
  assert.equal(f.finished[1].kind, "complete");
  assert.equal(f.timers.size, 0);
});

test("sign-out, service failures and malformed responses release the loading state", async () => {
  for (const [reply, expected] of [
    [{ ok: false, status: 401 }, "signed-out"],
    [{ ok: false, status: 503 }, "error"],
    [{ ok: true, status: 200, json: async () => ({ state: "active" }) }, "error"],
    [{ ok: true, status: 200, json: async () => ({ state: "active", hasSubscription: true, paidThrough: "invalid" }) }, "error"],
  ]) {
    const f = pollingFixture(() => reply);
    f.start();
    await f.settle();
    assert.equal(f.finished[0].kind, expected);
    assert.equal(f.statuses.length, 0);
    assert.equal(f.timers.size, 0);
  }
});

test("unmount cancels polling and ignores any later account response", async () => {
  let resolve;
  const f = pollingFixture(() => new Promise(done => { resolve = done; }));
  const cancel = f.start();
  cancel();
  resolve(statusReply("active"));
  await f.advance(60_000);
  assert.equal(f.finished.length, 0);
  assert.equal(f.statuses.length, 0);
  assert.equal(f.requests[0].init.signal.aborted, true);
  assert.equal(f.timers.size, 0);
});
