import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Exercise the production helper without pulling UI-only dependency packages
// into Node's stripped-TypeScript loader.
const source = readFileSync(new URL("../lib/utils.ts", import.meta.url), "utf8");
const helper = source.slice(source.indexOf("export function roomExpiryTimestamp"), source.indexOf("export function getHoursUntilExpiry"));
const compiled = ts.transpileModule(helper, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { roomExpiryTimestamp } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("unlimited room never inherits an old activity or expiry timestamp", () => {
  assert.equal(roomExpiryTimestamp({ expiry_mode: "none", expires_at: "2020-01-01T00:00:00Z", last_activity_at: "2020-01-01T00:00:00Z" }), null);
});

test("fixed room keeps its selected deadline as activity changes", () => {
  const expires_at = "2026-10-08T12:00:00Z";
  assert.equal(roomExpiryTimestamp({ expiry_mode: "fixed", expires_at, last_activity_at: "2026-10-07T23:00:00Z" }), expires_at);
  assert.equal(roomExpiryTimestamp({ expiry_mode: "fixed", expires_at: null, last_activity_at: "2026-10-07T23:00:00Z" }), null);
});

test("legacy inactivity rooms retain their old two-day deadline", () => {
  assert.equal(roomExpiryTimestamp({ expiry_mode: "inactivity", last_activity_at: "2026-10-07T00:00:00Z" }), "2026-10-09T00:00:00.000Z");
  assert.equal(roomExpiryTimestamp({ last_activity_at: "2026-10-07T00:00:00Z" }), "2026-10-09T00:00:00.000Z");
  assert.equal(roomExpiryTimestamp({ expiry_mode: "inactivity", last_activity_at: "invalid" }), null);
});
