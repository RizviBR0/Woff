import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as accountHelpers from "../lib/account-helpers.ts";

const { authReturnPath, safeReturnPath } = accountHelpers;

// Exercise the real server functions with isolated adapters. These tests never
// contact Supabase or deliver an email.
function loadServerModule(path, adapters) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exported = {};
  vm.runInNewContext(outputText, {
    exports: exported,
    require(name) {
      assert.ok(name in adapters, `Unexpected dependency: ${name}`);
      return adapters[name];
    },
    URL,
    process: { env: { NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://woff.space" } },
  });
  return exported;
}

function authFixture({ verified = false, sendError = null, mergeError = null, identityError = null, missingUser = false, initialCookies = [] } = {}) {
  const jar = new Map(initialCookies.map((cookie) => [cookie.name, cookie]));
  const cookieAdapter = {
    get: (name) => jar.get(name),
    set: (name, value, options) => jar.set(name, { name, value, ...options }),
    delete: ({ name }) => jar.delete(name),
  };
  const user = verified
    ? { id: "sender", email: "sender@example.invalid", email_confirmed_at: "2026-10-06", is_anonymous: false }
    : { id: "guest", is_anonymous: true };
  const calls = [];
  const supabase = {
    auth: {
      getUser: async () => ({ data: { user: missingUser ? null : user }, error: identityError }),
      signInAnonymously: async () => { calls.push(["signInAnonymously"]); return { data: { user }, error: null }; },
      signInWithOtp: async (args) => { calls.push(["signInWithOtp", args]); return { error: sendError }; },
      updateUser: async (...args) => { calls.push(["updateUser", ...args]); return { error: sendError }; },
      signOut: async (args) => { calls.push(["signOut", args]); return { error: null }; },
    },
    rpc: async (name) => {
      calls.push([name]);
      if (name === "create_account_merge_ticket") return { data: "a".repeat(64), error: null };
      return { error: name === "redeem_account_merge_ticket" ? mergeError : null };
    },
  };
  const adapters = {
    "server-only": {},
    "next/headers": {
      cookies: async () => cookieAdapter,
      headers: async () => new Headers(),
    },
    "next/navigation": {
      redirect(destination) { const error = new Error("redirect"); error.destination = destination; throw error; },
    },
    "@supabase/ssr": {},
    "@/lib/supabase": { createServerSupabaseClient: async () => supabase },
    "@/lib/launch-config": { getLaunchConfig: () => ({ accountsEnabled: true, emailDeliveryVerified: true }) },
    "@/lib/account-helpers": accountHelpers,
  };
  const account = loadServerModule("../lib/account.ts", adapters);
  const actions = loadServerModule("../app/sign-in/actions.ts", { ...adapters, "@/lib/account": account });
  return { account, actions, jar, calls, supabase };
}

function signInForm(mode = "existing", next = "/checkout") {
  const form = new FormData();
  form.set("email", "  Sender@Example.invalid  ");
  form.set("mode", mode);
  form.set("next", next);
  return form;
}

test("email confirmation resumes checkout even when a custom template points to dashboard", () => {
  assert.equal(authReturnPath("/checkout", "/dashboard"), "/checkout");
  assert.equal(
    authReturnPath("/checkout?plan=pro#summary", "/dashboard"),
    "/checkout?plan=pro#summary",
  );
});

test("a new browser or an expired destination cookie uses the checked email destination", () => {
  assert.equal(authReturnPath(undefined, "/account"), "/account");
  assert.equal(authReturnPath("", "/checkout"), "/checkout");
  assert.equal(authReturnPath(undefined, undefined), "/dashboard");
});

test("neither the return cookie nor the email URL can redirect outside Woff", () => {
  const unsafe = [
    "https://evil.invalid/checkout",
    "//evil.invalid/checkout",
    "/\\evil.invalid",
    "/%2F%2Fevil.invalid",
    "/%5cevil.invalid",
    "/%0d%0aLocation:https://evil.invalid",
    "/%zz",
    "/auth/confirm",
    "/%61uth/confirm",
    "/notes/../auth/callback",
    "/notes/%2e%2e/auth/callback",
  ];
  for (const path of unsafe) {
    assert.equal(authReturnPath(path, "/checkout"), "/checkout", path);
    assert.equal(authReturnPath(undefined, path), "/dashboard", path);
    assert.equal(authReturnPath(path, path), "/dashboard", path);
  }
});

test("return destinations are bounded to fit their authentication cookie", () => {
  assert.equal(safeReturnPath(`/checkout?x=${"a".repeat(2048)}`), "/dashboard");
  assert.equal(authReturnPath(`/checkout?x=${"a".repeat(2048)}`, "/account"), "/account");
});

test("accepted existing-account and signup emails save a short-lived secure destination", async () => {
  for (const mode of ["existing", "link"]) {
    const fixture = authFixture();
    const state = await fixture.actions.sendSignInEmail({}, signInForm(mode));
    assert.equal(state.ok, true);
    assert.equal(state.email, "sender@example.invalid");
    const saved = fixture.jar.get(fixture.account.AUTH_RETURN_COOKIE);
    assert.equal(saved.value, "/checkout");
    assert.equal(saved.httpOnly, true);
    assert.equal(saved.secure, true);
    assert.equal(saved.sameSite, "lax");
    assert.equal(saved.maxAge, 3600);
  }
});

test("identity verification failure preserves the guest session and pending cookies", async () => {
  for (const mode of ["existing", "link"]) {
    const fixture = authFixture({ missingUser: true, identityError: { name: "AuthRetryableFetchError" }, initialCookies: [
      { name: "woff_auth_return", value: "/account" }, { name: "woff_account_merge", value: "protected-proof" },
    ] });
    const before = [...fixture.jar];
    const state = await fixture.actions.sendSignInEmail({}, signInForm(mode));
    assert.equal(state.ok, undefined);
    assert.match(state.message, /verify this browser's session/);
    assert.deepEqual(fixture.calls, []);
    assert.deepEqual([...fixture.jar], before);
  }
});

test("a genuinely missing session can create a guest for email signup", async () => {
  const fixture = authFixture({ missingUser: true, identityError: { name: "AuthSessionMissingError" } });
  const state = await fixture.actions.sendSignInEmail({}, signInForm("link"));
  assert.equal(state.ok, true);
  assert.equal(fixture.calls[0][0], "signInAnonymously");
  assert.equal(fixture.calls[1][0], "updateUser");
});

test("failed or suppressed sends do not replace the initiating destination", async () => {
  for (const mode of ["existing", "link"]) {
    for (const status of [400, 422, 429, 500]) {
      const fixture = authFixture({ sendError: { status } });
      const state = await fixture.actions.sendSignInEmail({}, signInForm(mode));
      assert.equal(fixture.jar.has(fixture.account.AUTH_RETURN_COOKIE), false, `${mode}: ${status}`);
      if (mode === "existing" && (status === 400 || status === 422)) {
        assert.equal(state.ok, true, "Existing-account results must not disclose whether the email exists");
        assert.match(state.message, /If this email has an account/);
      }
    }
  }
});

test("successful confirmation commits the session and consumes its checkout destination", async () => {
  const fixture = authFixture({ verified: true, initialCookies: [{ name: "woff_auth_return", value: "/checkout" }] });
  let committed = false;
  await assert.rejects(
    fixture.account.finishAccountAuthentication("/dashboard", {
      supabase: fixture.supabase,
      sourceUserId: "sender",
      sourceOwnsRooms: true,
      commit: () => { committed = true; },
    }),
    (error) => error.destination === "/checkout",
  );
  assert.equal(committed, true);
  assert.equal(fixture.jar.has(fixture.account.AUTH_RETURN_COOKIE), false);
});

test("a transferred guest returns to checkout with recovery notice and cleared proof", async () => {
  const fixture = authFixture({ verified: true, initialCookies: [
    { name: "woff_auth_return", value: "/checkout?plan=pro#summary" },
    { name: "woff_account_merge", value: "a".repeat(64) },
    { name: "woff_account_merge_pending", value: "existing" },
  ] });
  let committed = false;
  await assert.rejects(
    fixture.account.finishAccountAuthentication("/dashboard", {
      supabase: fixture.supabase,
      sourceUserId: "guest",
      sourceOwnsRooms: true,
      commit: () => { committed = true; },
    }),
    (error) => error.destination === "/checkout?plan=pro&notice=rooms-recovered#summary",
  );
  assert.equal(committed, true);
  assert.equal(fixture.jar.size, 0);
  assert.ok(fixture.calls.some(([name]) => name === "redeem_account_merge_ticket"));
});

test("failed ownership transfer preserves both guest session and checkout intent", async () => {
  for (const hasProof of [false, true]) {
    const initialCookies = [{ name: "woff_auth_return", value: "/checkout" }];
    if (hasProof) initialCookies.push({ name: "woff_account_merge", value: "a".repeat(64) });
    const fixture = authFixture({ verified: true, mergeError: { message: "expired" }, initialCookies });
    await assert.rejects(
      fixture.account.finishAccountAuthentication("/dashboard", {
        supabase: fixture.supabase,
        sourceUserId: "guest",
        sourceOwnsRooms: true,
        commit: () => assert.fail("Failed ownership transfer cannot replace the guest session"),
      }),
      (error) => error.destination === `/sign-in?error=${hasProof ? "transfer-failed" : "transfer-required"}`,
    );
    assert.equal(fixture.jar.get(fixture.account.AUTH_RETURN_COOKIE)?.value, "/checkout");
    assert.equal(fixture.jar.has(fixture.account.MERGE_COOKIE), hasProof);
  }
});

test("sign-out clears return intent and guest transfer proof", async () => {
  const fixture = authFixture({ verified: true, initialCookies: [
    { name: "woff_auth_return", value: "/checkout" },
    { name: "woff_account_merge", value: "a".repeat(64) },
    { name: "woff_account_merge_pending", value: "existing" },
  ] });
  await assert.rejects(fixture.actions.signOutAccount(), (error) => error.destination === "/sign-in");
  assert.equal(fixture.jar.size, 0);
  assert.equal(fixture.calls.find(([name]) => name === "signOut")[1].scope, "local");
});
