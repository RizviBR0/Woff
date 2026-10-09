import test from "node:test";
import assert from "node:assert/strict";
import { migrateRoomBrowserState } from "../lib/space-recovery.ts";

function browserStorage(values) {
  const entries = new Map(Object.entries(values));
  globalThis.window = {};
  globalThis.localStorage = {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  };
  return entries;
}

const previous = { id: "room-a", slug: "1234", creator_device_id: "owner-a", access_version: 2 };
const current = { ...previous, slug: "5678" };

test("room code change preserves the owner's recovery key and current invitation", () => {
  const storage = browserStorage({
    woff_invite_1234: "invitation", woff_invite_room_1234: "room-a", woff_invite_version_1234: "2",
    woff_recovery_1234: "recovery", woff_recovery_room_1234: "room-a", woff_recovery_owner_1234: "owner-a",
    last_room: "1234", last_created_space: "1234",
  });
  migrateRoomBrowserState(previous, current);
  assert.equal(storage.get("woff_invite_5678"), "invitation");
  assert.equal(storage.get("woff_recovery_5678"), "recovery");
  assert.equal(storage.get("woff_recovery_room_5678"), "room-a");
  assert.equal(storage.get("last_room"), "5678");
  assert.equal(storage.has("woff_invite_1234"), false);
  assert.equal(storage.has("woff_recovery_1234"), false);
});

test("room code change does not carry a revoked invitation or another room's key", () => {
  const storage = browserStorage({
    woff_invite_1234: "revoked", woff_invite_room_1234: "room-a", woff_invite_version_1234: "2",
    woff_recovery_1234: "another-room-key", woff_recovery_room_1234: "room-b", woff_recovery_owner_1234: "owner-a",
  });
  migrateRoomBrowserState(previous, { ...current, access_version: 3 });
  assert.equal(storage.has("woff_invite_5678"), false);
  assert.equal(storage.has("woff_recovery_5678"), false);
});

test("browser state does not migrate across room identity or ownership changes", () => {
  const storage = browserStorage({
    woff_recovery_1234: "previous-owner-key", woff_recovery_room_1234: "room-a", woff_recovery_owner_1234: "owner-a",
  });
  migrateRoomBrowserState(previous, { ...current, id: "room-b" });
  assert.equal(storage.has("woff_recovery_1234"), true);
  migrateRoomBrowserState(previous, { ...current, creator_device_id: "owner-b" });
  assert.equal(storage.has("woff_recovery_5678"), false);
});
