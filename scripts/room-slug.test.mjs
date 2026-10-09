import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import {
  extractRoomSlug, isLegacyRoomSlug, isValidRoomSlug, normalizeRoomSlug,
  RESERVED_ROOM_SLUGS, ROOM_SLUG_MAX_LENGTH, suggestRoomSlug,
} from "../lib/room-slug.ts";
import * as roomSlugs from "../lib/room-slug.ts";

test("legacy four-digit room codes and named Pro URLs use one bounded syntax", () => {
  for (const slug of ["0000", "1234", "9999", "sabbir", "rose-lemon", "sabbir-2026", "42-rizvi", "a".repeat(40)]) {
    assert.equal(isValidRoomSlug(slug), true, slug);
  }
  for (const slug of ["", "12", "123", "12345", "ab", "Sabbir", "hello_world", "a--b", "-sabbir", "sabbir-", "a".repeat(41), "বাংলা", "sabbir/room", "sa%62bir", "sabbir?next=x"]) {
    assert.equal(isValidRoomSlug(slug), false, slug);
  }
  assert.equal(isLegacyRoomSlug("1234"), true);
  assert.equal(isLegacyRoomSlug("sabbir"), false);
  assert.equal(normalizeRoomSlug("  Sabbir-Rizvi  "), "sabbir-rizvi");
});

test("custom room URLs cannot shadow current pages or reserved account routes", () => {
  for (const slug of RESERVED_ROOM_SLUGS) assert.equal(isValidRoomSlug(slug), false, slug);
  const appFolders = readdirSync(new URL("../app", import.meta.url), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("["));
  for (const folder of appFolders) {
    assert.ok(RESERVED_ROOM_SLUGS.includes(folder.name), `Reserve application route: ${folder.name}`);
  }
});

test("room lookup handles names, canonical capitalization, numeric URLs and note URLs", () => {
  for (const [input, slug] of [
    ["  Sabbir-Rizvi  ", "sabbir-rizvi"], ["1234", "1234"], ["/1234", "1234"],
    ["https://woff.space/Sabbir?join=1", "sabbir"], ["/sabbir/AbCd12", "sabbir"],
    ["https://woff.space/r/1234", "1234"], ["/sabbir/", "sabbir"],
    ["woff.space/sabbir", "sabbir"], ["www.woff.space/SABBIR", "sabbir"], ["localhost:3000/sabbir", "sabbir"],
  ]) assert.equal(extractRoomSlug(input), slug, input);
});

test("room lookup rejects stray digits, unrelated routes and encoded or unsafe paths", () => {
  for (const input of [
    "Call me at 123456", "https://woff.space/pricing", "/s/" + "ab".repeat(32),
    "javascript:/sabbir", "https:sabbir", "//other.example/sabbir", "https://user:password@woff.space/sabbir",
    "/sabbir%2Froom", "/sabbir%3Froom", "/x/../sabbir", "/sabbir/../../account",
    "sabbir\\room", "/sabbir/room/more", "/not-a-room/../../1234", "hello@1234",
  ]) assert.equal(extractRoomSlug(input), "", input);
});

test("room-name suggestions preserve readable words within URL limits", () => {
  assert.equal(suggestRoomSlug("Sabbir Hossain Rizvi"), "sabbir-hossain-rizvi");
  assert.equal(suggestRoomSlug("  José's Files & Notes  "), "jose-s-files-notes");
  assert.equal(suggestRoomSlug("a".repeat(39) + " a"), "a".repeat(39));
  assert.equal(suggestRoomSlug("বাংলা"), "");
  assert.equal(suggestRoomSlug("Sign in"), "sign-in");
  assert.equal(isValidRoomSlug(suggestRoomSlug("Sign in")), false);
  assert.equal(suggestRoomSlug("a".repeat(100)).length, ROOM_SLUG_MAX_LENGTH);
});

function actionFixture(error = null) {
  const calls = [];
  let identityLookups = 0;
  const adapters = {
    crypto: {}, "next/headers": {}, "sanitize-html": {}, marked: {},
    nanoid: { customAlphabet: () => () => "AbCd12" }, "next/server": {},
    "@/lib/display-name": { displayNameForDevice: () => "Rose Lemon" },
    "@/lib/room-slug": roomSlugs, "@/lib/handoff-template": {},
    "@/lib/supabase": {
      requireAnonymousUser: async () => {
        identityLookups++;
        return {
          user: { id: "viewer" },
          supabase: { rpc: async (name, args) => {
            calls.push({ name, args });
            return { data: name === "recover_space_ownership"
              ? { recovered: true, recovery_key: "replacement", space: { slug: args.p_slug } }
              : { slug: args.p_slug, id: "room" }, error };
          } },
        };
      },
    },
  };
  const compiled = ts.transpileModule(readFileSync(new URL("../lib/actions.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const actions = {};
  vm.runInNewContext(compiled, {
    exports: actions,
    require(name) { assert.ok(name in adapters, `Unexpected dependency: ${name}`); return adapters[name]; },
    URL, Date, Buffer, process: { env: {} },
  });
  return { actions, calls, get identityLookups() { return identityLookups; } };
}

test("join and recovery actions preserve named slugs and never reinterpret text as a numeric code", async () => {
  const fixture = actionFixture();
  assert.equal((await fixture.actions.joinSpace(" Sabbir-Rizvi ")).slug, "sabbir-rizvi");
  assert.equal(fixture.calls[0].args.p_slug, "sabbir-rizvi");
  const recovered = await fixture.actions.recoverSpace(" SABBIR ", "A".repeat(32));
  assert.equal(recovered.space.slug, "sabbir");
  assert.equal(fixture.calls[1].args.p_slug, "sabbir");
  assert.equal(await fixture.actions.joinSpace("check 1234"), null);
  assert.equal(await fixture.actions.recoverSpace("../account", "A".repeat(32)), false);
  assert.equal(fixture.identityLookups, 2);
});

test("custom URL rotation uses the same syntax and defers entitlement decisions to the database", async () => {
  const denied = actionFixture({ message: "Pro is required" });
  await assert.rejects(denied.actions.rotateRoomCode("room", " Sabbir "), /Pro is required/);
  assert.equal(denied.calls[0].args.p_slug, "sabbir");
  const fixture = actionFixture();
  await fixture.actions.rotateRoomCode("room");
  assert.equal(fixture.calls[0].args.p_slug, null);
  await fixture.actions.rotateRoomCode("room", "5678");
  assert.equal(fixture.calls[1].args.p_slug, "5678");
  await assert.rejects(fixture.actions.rotateRoomCode("room", "sign-in"), /valid custom room URL/);
  assert.equal(fixture.identityLookups, 2);
});
