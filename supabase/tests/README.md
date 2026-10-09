# Launch database verification

The local launch migration is
`20261003140629_launch_safety_sender_entitlements.sql`, created with Supabase CLI
2.119.0 `migration new`. The reviewed release was applied to WoffNote Share
through Supabase MCP as hosted version `20261004070203`, named
`launch_safety_sender_entitlements`. This version mapping does not justify a
blind `db push`, replaying historical migrations or repairing migration history.
Deployment status, live preflight and hosted verification results belong in
[launch-readiness.md](../../docs/launch-readiness.md).

The room-access migration is
`20261007153006_flexible_room_access.sql`, created with Supabase CLI 2.120.0.
It preserves historical room admission settings and deadlines while allowing
new rooms to remain open without a deadline. Its hosted application is tracked
separately in launch-readiness; the local filename is not a hosted version.

The Pro room-identity migration is
`20261008092538_pro_room_identity.sql`, created with Supabase CLI 2.120.0.
It adds a narrowly scoped owner RPC for room names and readable URL slugs,
reserves application routes and retired URLs, and preserves each room's UUID,
invitations, admission controls, timer, delivery settings and allowance. Current
verified Pro entitlement governs changes even when the room uses Free storage
limits. Existing custom URLs remain usable after a subscription ends. Its hosted
application is tracked separately in launch-readiness.

The public Test checkout migration is
`20261009061527_public_test_checkout_capacity.sql`, created with Supabase CLI
2.120.0. Test subscriptions and checkout leases carry their billing mode; only
Live subscriptions reserve an unused 1 GiB allowance. Test uploads still charge
actual objects and pending uploads against the existing shared storage budget.
Switching billing mode cannot convert a Test subscription into Live entitlement
or redeem a checkout lease issued for the other mode. The migration creates no
paid entitlement, changes no storage budget, and enables no checkout flag.
The follow-up `20261009062445_close_missing_checkout_configuration.sql` migration
rejects checkout admission if the singleton configuration row is missing.

## Reproduce the local checks

The runner connects only to `127.0.0.1:55439`. It recreates the disposable
`woff_launch_safety_test` database; it never reads a project URL, API key, or
production database environment variable. PostgreSQL 17.6 must already be running
there with the local `postgres` fixture user. The workspace's ignored runtime
uses `pg@8.16.3` and `@embedded-postgres/windows-x64@17.6.0-beta.15` under
`internal/db-runtime/node_modules`.

```powershell
npm install --prefix internal/db-runtime --no-save --package-lock=false pg@8.16.3 @embedded-postgres/windows-x64@17.6.0-beta.15
./supabase/tests/start-local-postgres.ps1
node supabase/tests/launch-safety.test.mjs
node supabase/tests/pro-room-identity.test.mjs
node supabase/tests/public-test-checkout.test.mjs
```

The helper initializes a new cluster under `internal/db-runtime/data`, starts it
hidden with local trust authentication, and refuses to reuse port 55439 when its
server reports a different data directory. It does not delete a cluster or stop
one used by another process. Do not bind this trust-authenticated fixture to a
public interface. Docker/Supabase CLI local development is also suitable after
adapting the fixture connection deliberately.

`platform-bootstrap.sql` supplies minimal Auth and Storage schemas, real
PostgreSQL roles/RLS, a Realtime publication, and inert Cron/Vault/HTTP fixtures.
All repository migrations execute unchanged except the historical `pg_net`
extension declaration, replaced with the fixture's no-network HTTP stub.
The loader discovers every `.sql` file in `supabase/migrations` and runs them in
filename order, so it automatically includes the corrective
`20261004070954_fix_entry_insert_returning.sql` migration.

The Pro identity runner recreates its own disposable
`woff_pro_room_identity_test` database on the same loopback fixture. Its **17
grouped behavior checks** passed on October 8, 2026: current verified Pro owner
authorization, legacy Free room customization without an allowance change,
Unicode names and canonical URL normalization, invalid/reserved URL rollback,
active/retired URL reservations, concurrent claims with one winner, consistent
lock ordering across identity/rotation/access edits, a blocked edit rejecting a
committed entitlement downgrade, unchanged
invitations/members/access versions/time limits, note UUID routing, downgrade
behavior, ordinary numeric Free room joining, expired-room rejection, RPC and
table privileges, recovery revocation/key rotation, and deleted-room reservation
cascades. The existing **48 launch database checks** also pass with this migration.

The public Test billing runner recreates only
`woff_public_test_checkout_test` on `127.0.0.1:55439`. Its **13 grouped database
checks** passed on October 9, 2026: Live checkout rejects an unfunded 800 MiB
budget; Test checkout respects five verified sender seats without fabricating
storage commitments; browser and cross-mode event rejection; actual Pro room
identity/template authorization; concurrent upload admission at the physical
800 MiB boundary; uploaded and cancelled object accounting until physical
cleanup; checkout/subscription provenance across mode changes; duplicate,
stale, cancellation, refund and grace behavior; late Test admission; no Test
unlimited-upload fallback; full funded Live 1 GiB admission; and privileged
function/table ACLs; and missing-configuration admission/authorization failures.
All **48 launch safety** and **17 Pro room identity** checks
also pass with the new migration. Local security and performance advisors found
no warning/error issues on the disposable billing database. These SQL checks do
not replace real provider checkout, signed webhook, or Storage HTTP checks.

Verified locally on October 7, 2026:

- All historical migrations, the additive launch migration, the corrective
  entry policy migration and the room-access migration compile.
- **48 database behavior checks pass**, including historical room preservation,
  code and invitation access after seven inactive days without a timer, optional
  Free room deadlines that activity cannot extend, code closure preserving
  existing members and selected timers, invitation deadline synchronization,
  code collision/concurrency and retired-code reservations, plus the existing
  security and billing checks below: authenticated plain-text
  `INSERT ... RETURNING`, subsequent `UPDATE ... RETURNING` and SELECT;
  revocation of public-table `TRUNCATE`, `REFERENCES` and `TRIGGER` privileges from
  `anon` and `authenticated` while preserving service-role maintenance access;
  two concurrent upload transactions; room/account quota enforcement;
  actual-size verification and immutable keys;
  cancellation queues; private note assets; optimistic privacy updates;
  expired rooms and invitations; recipient read-only access and revocation;
  recovery rotation and selective authorship restoration; single-use account
  merges; bounded paid retention and ten active paid rooms; telemetry ACLs;
  server-selected rate limits; checkout capacity; billing deduplication/order;
  cancellation, grace, refunds, renewable capacity, and late/reactivated payments.
- Supabase CLI security and performance advisors reported no warning/error
  issues on the disposable database:

```powershell
npx --yes supabase@2.120.0 db advisors --db-url 'postgresql://postgres@127.0.0.1:55439/woff_launch_safety_test?sslmode=disable' --type security --level warn --fail-on error
npx --yes supabase@2.120.0 db advisors --db-url 'postgresql://postgres@127.0.0.1:55439/woff_launch_safety_test?sslmode=disable' --type performance --level warn --fail-on error
```

The CLI labels an explicitly supplied database URL “remote”; the URLs above are
loopback addresses. A separate read-only live preflight was performed for the
authorized Free release; its results and the hosted migration record are tracked
in [launch-readiness.md](../../docs/launch-readiness.md).

A real authenticated plain-text `INSERT ... RETURNING` failed with SQLSTATE
`42501` before the corrective entry policy migration. The SELECT policy now
evaluates the new row's fields directly instead of reselecting it through a
`STABLE` helper that cannot see the row inserted by that statement. The fix
preserves entry expiry, private legacy content checks and room authorization.
The regression also verifies the later update/read and denies an unrelated
member. Hosted application of this correction is tracked in
[launch-readiness.md](../../docs/launch-readiness.md).

The application unit suite also passed **30 tests**, including bounded invitation
and note-target parsing, rejection of cached or unspecified direct-download
policies, and cleanup of
paginated files and nested folders, isolation of room UUID prefixes, retries
after partial nested deletion or queue-clear failure, and detection of unsafe
prefixes or successful-looking deletion no-ops. Reproduce it from the repository
root:

```powershell
npm run test:unit
```

## Application contracts

- `create_space(p_display_name)` retains `{space,recovery_key}` and adds
  `invite_token`/`invitation_id`. New rooms have `code_enabled=true`,
  `expiry_mode='none'` and `expires_at=null`. Historical rooms retain their former
  code admission and expiry. `open_space` supplies `space.can_write`.
- `set_room_access(space_id,code_enabled,expires_at,update_expiry=true)` accepts
  an optional future deadline or NULL for no timer. Passing `update_expiry=false`
  changes code admission while preserving the timer and inactivity/fixed mode.
  Closing a code stops new code joins; existing members retain access.
- `rotate_room_code(space_id,slug=null)` generates a new code or validates an
  exact four-digit custom code. The UUID, existing members and invitations stay
  intact. Retired codes remain reserved privately until their room is deleted.
- `create_room_invitation(space_id,can_write,expires_at)` and
  `rotate_room_access(space_id)` return `{id,token,expires_at,access_version}`.
  The database stores only a token hash. Rotation invalidates existing recipient
  grants and closes code joining. Revoking an invitation immediately invalidates
  its existing memberships.
- `join_room_invitation(token,display_name)` grants access; opening a note or a
  four-digit URL afterward cannot bypass a closed code or revoked grant.
  Newly created room-bound invitations and memberships follow explicit owner
  timer changes. Separately timed invitations retain their own deadline. Historical
  invitations whose deadline differs from the room's are conservatively kept
  separate; the UI creates a fresh invitation after a timer change.
- `recover_space_ownership(slug,recovery_key,display_name)` returns
  `{recovered,recovery_key,space}` and rotates access and recovery proof.
  `recover_space` remains a boolean compatibility wrapper, but new clients must
  use the JSON RPC to retain the new secret. `rotate_room_recovery_key(space_id)`
  returns `{recovery_key}`. Account merges deliberately invalidate old recovery
  proof; a verified owner can mint a replacement afterward.
- `create_account_merge_ticket()` returns a raw, hashed-at-rest, ten-minute token.
  `redeem_account_merge_ticket(token)` requires a verified target account and
  returns `{merged,rooms_transferred}`. Billing ownership is never merged through
  a room recovery proof. Participant authorship stays with that participant.
- `set_note_privacy(slug,is_locked,expected_version)` returns
  `{version,updated_at,is_locked}` and atomically updates the entry metadata.
  `open_note.can_edit` incorporates both authorship and effective room write access.
- `ensure_sender_account`, `get_sender_account`, `get_sender_dashboard`,
  `save_sender_template`, `create_room_from_template(p_device_id)` and
  `update_room_settings` enforce verified identity and server entitlements.
  The legacy parameter name `p_device_id` is a display label; it is never identity.
  Templates contain room settings/welcome instructions, not cloned private assets.
- Free file allowance is 200 MiB/room and 400 MiB/owner; Pro is 1 GiB/owner.
  The ten-room cap covers active Pro handoff rooms, including those without timers.
  A sender can still use the ordinary free room workflow. Stored asset bytes and
  live reservations are separate snapshot fields and must be added in usage UI.
- `record_room_event(space_id,event)` accepts only `share_initiated`,
  `download_initiated` and `upload_failed`; it is authorized and rate limited.
  Automatic successful room/file/note counters and these events store only UTC
  day, event, and count in a private table. A download event means initiation.

## Storage transport boundary

The current official [uploader source](https://github.com/supabase/storage/blob/master/src/storage/uploader.ts)
uses a synthetic permission-check INSERT with `metadata.contentLength`; the
[TUS lifecycle](https://github.com/supabase/storage/blob/master/src/http/routes/tus/lifecycle.ts)
uses `Upload-Length`/the stored upload length. Preflight RLS requires the declared
length to equal the reservation. Unknown-length uploads fail closed. Completed
objects carry backend `metadata.size`; the final storage trigger checks actual
size independently of JWT/RLS because Storage completes through a privileged
connection. Asset publication validates backend size and owner again and
consumes the reservation in the same transaction.

Woff must use TUS or a known-size binary body. Inline images should pass the
file's ArrayBuffer to standard upload, with explicit content type; multipart
`File` uploads add boundary bytes and do not satisfy exact preflight length.
Published objects cannot be upserted; retries reuse an existing live reservation,
and subsequent publications require a new key.

Authenticated browsers cannot SELECT any Woff Storage object, including their
own published files and unfinished reservations. This prevents a browser from
minting an arbitrarily long signed URL through the Storage API. The application
server first validates each file request with the user's room/asset RLS and
checks backend object cache metadata. New uploads use `cacheControl: "0"`.
Only objects whose metadata reports `max-age=0` or `no-store` may receive a direct
Storage redirect with a signed token lifetime of at most 60 seconds. Legacy,
long-cache or unknown-cache objects are streamed through the authenticated app
route with `Cache-Control: private, no-store`, without exposing another signed
Storage URL. Service credentials never reach the browser.

The official [Storage database adapter](https://github.com/supabase/storage/blob/master/src/storage/database/pg.ts)
implements upload permission checks as INSERT without RETURNING, so denying
SELECT preserves that preflight. TUS HEAD/OPTIONS skip upload authorization in
the lifecycle source. Storage deletion uses DELETE RETURNING and requires
SELECT; direct browser `Storage.remove()` is consequently unavailable. Room,
entry, and reservation cancellation must enqueue object paths in SQL, followed
by privileged Storage cleanup. Tests confirm authorized asset rows remain
readable while both pending and published raw Storage rows stay hidden, and
preflight plus publication still succeed.

Changing RLS does not invalidate an earlier signed Storage URL. Token expiry and
response cache lifetime are independent; a cached signed response may remain
available after its token expires. Historical client-issued URLs can have both
longer tokens and longer cache lifetimes. Do not infer a universal 60-second
revocation bound from the application's token cap. Check hosted zero-cache
delivery, legacy authenticated streaming and physical deletion separately.
Smart CDN is enabled on Pro and above and needs separate verification before
future paid/CDN activation. Already downloaded copies cannot be revoked.
[Supabase signed URLs and caching](https://supabase.com/docs/guides/storage/cdn/smart-cdn#signed-urls-and-cdn-caching).

## Hosted verification and future paid gates

SQL fixtures do not emulate the hosted Storage HTTP server, real byte objects,
Auth email/link delivery, Realtime delivery, Stripe/Lemon Squeezy infrastructure,
Cron execution or physical Edge Function deletion. They do not establish live
schema parity or operational capacity.

The owner authorized a direct Free release to the existing WoffNote Share project
and omitted cloud staging and a backup because the existing data is disposable.
For this scope, local checks, comparison with the live schema/history and new
disposable hosted rooms are the verification path. Use
[launch-readiness.md](../../docs/launch-readiness.md) for completed and outstanding
deployment steps. The hosted Free checks are:

1. Compare effective grants, RLS policies, platform columns and migration history;
   apply only reviewed release changes through the authorized process.
2. Exercise real standard binary and TUS uploads, retries, slow/expired uploads,
   actual-size failures, signed token expiry, response cache behavior, locked
   assets, and physical cleanup.
   Confirm browser signing/raw reads fail, server signing follows user-RLS
   authorization, zero-cache metadata selects bounded direct redirects, legacy
   or unknown-cache metadata selects authenticated no-store streaming, and queued
   cancellation deletes physical objects. Account for earlier signed URLs and
   cached responses before making any revocation guarantee.
3. Verify anonymous Auth, invitations, private assets, revocation, ownership
   recovery and Realtime delivery. Resend SMTP is user-configured; provider setup
   alone does not prove delivery or account linking.
   `WOFF_EMAIL_DELIVERY_VERIFIED=true` is enabled only for controlled hosted
   verification until an owner-controlled
   inbox and the account flows pass.

Checkout remains closed for this Free release:
`WOFF_BILLING_ENABLED=false`, `WOFF_STORAGE_CAPACITY_VERIFIED=false`, and the
private capacity row has `checkout_enabled=false`, `capacity_bytes=838860800`
(800 MiB), `billing_test_mode=false`, and a maximum of five paid pilot senders.
These values do not establish paid capacity or enable paid admission.

Future paid activation requires a separate isolated staging/provider/capacity
procedure:

1. Verify the payment sandbox lifecycle, including delayed events and operator
   resolution for denied late payments. Existing issued checkout leases remain
   reserved until expiry.
2. Confirm funded backend capacity, stored physical bytes, cleanup backlog and
   all promised allowances before opening either checkout gate. Reserve a full
   paid allowance for every paid or pending account, with Free usage and cleanup
   headroom. A capacity budget is not an infrastructure spending cap.
3. Keep Pro capacity reserved while the canonical provider can renew/retry a
   subscription, even after access/grace expires or its last invoice is refunded.
   Release only when canonical provider state says it has ended. Admission and
   new Free reservations share the capacity lock; renewed paid allowances cannot
   be sold to another sender prematurely.

Service operators manage `woff_private.pilot_capacity`, checkout reservations,
billing event dispositions and aggregate product metrics through restricted SQL.
No customer-facing table permission can grant Pro, set capacity, write metrics
directly or run maintenance. Room owners change deadlines only through the
validated room-access RPC, independently of Pro presentation settings.

## Isolated billing transport checks

`billing-fixture-adapter.test.mjs` opts into the bounded transport with
`billingTestMode: true`. It recreates only **woff_billing_fixture** on the fixed
loopback PostgreSQL server above and listens on `127.0.0.1:55440`. Stop any local
browser or billing transport using that port first; do not run it while a real
provider test checkout is in progress, because its disposable database is reset.

```powershell
node --test supabase/tests/billing-fixture-adapter.test.mjs
```

The nine checks use actual Supabase SDK Auth/RPC calls and SQL roles/RLS. The
opt-in profile allows only the implemented billing RPCs and narrowly filtered
entitlement reads. Its signed local service-role token is rejected without
explicit opt-in and in browser-origin requests. Ordinary room transport defaults
remain unchanged. The synthetic Auth service does not test hosted SMTP, Storage,
Realtime delivery or Cron. Neither fixture credentials nor platform bootstrap
SQL belong in a hosted project. See the dated payment results and pending real
provider checks in [launch-readiness.md](../../docs/launch-readiness.md).

## Local browser journeys

`browser-fixture.mjs` starts a bounded local Auth/PostgREST transport on
`127.0.0.1:55440` and an isolated Next development app on port 3002. It recreates
only the disposable `woff_browser_fixture` database on the PostgreSQL instance
above, leaving `woff_launch_safety_test` untouched. Run these commands from the
repository root in separate PowerShell terminals:

```powershell
# Terminal 1: keep this process running during verification.
node supabase/tests/browser-fixture.mjs

# Terminal 2: run the 12 browser journeys with installed Microsoft Edge.
node supabase/tests/browser-fixture-smoke.mjs
```

The launcher copies application source, configuration and middleware into
`internal/browser-app`, with a junction to the existing `node_modules`. It does
not copy or load `.env.local` or another environment file. Supabase URLs and keys
are explicit local fixture values; email verification, hosted checkout, funded
Storage capacity and provider credentials remain disabled. The smoke browser
blocks nonlocal HTTP traffic and fails on any attempted hosted Supabase request.
The transport validates fixture JWT signatures and executes each RPC/query using
the real `authenticated`/`anon` PostgreSQL role and JWT claims. Unknown transport
endpoints fail closed. Its fixed test signing secret must never be reused outside
this loopback fixture.

For a separate interactive inspection using the pinned CLI:

```powershell
npx --yes agent-browser@0.38.2 --session woff-fixture --executable-path 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' open http://localhost:3002
npx --yes agent-browser@0.38.2 --session woff-fixture snapshot -i
npx --yes agent-browser@0.38.2 --session woff-fixture close
```

The smoke verifies these 12 journeys with database assertions as well as the
actual browser UI. The server runs in UTC and browser contexts use Asia/Dhaka;
timestamp assertions cover stable UTC server markup followed by local display,
and hydration errors fail the run:

1. Fresh anonymous creation of a Free handoff and its seeded rich note, including
   stable server timestamps and browser-local entry times.
2. A long invitation share modal fitting desktop and mobile widths, with its
   link field and copy button inside the dialog bounds.
3. Pending editor changes flushed before privacy changes, followed by private
   autosave, including Bengali text.
4. A stale editor conflict after three remote SQL revisions, then explicit
   overwrite against the latest version.
5. Private note content denied both by recipient RLS and its browser reader route.
6. Note clipboard and QR links carrying an invitation for a fresh receiver,
   with a validated target note.
7. Owner invitation rotation invalidating an existing recipient session.
8. Automatic ownership recovery replacing stale cached invitation and recovery
   proof, followed by a fresh recipient joining the replacement invitation.
9. A verified Pro fixture sender creating a seven-day handoff from the dashboard,
   with posting/note controls absent from the read-only recipient UI and stable
   server-rendered expiry followed by local display.
10. Dashboard search by name and room code, its no-match state, and clearing search.
11. A normalized paused/Free entitlement removing Pro controls while an existing
   paid room remains accessible with its original retention.
12. A write made after the server page snapshot but before the initial socket
   connection appearing through authorized snapshot reconciliation, without a
   simulated change event. Collapsed sidebar controls also have accessible names
   and correct expansion state.

Results and screenshots are written under ignored `internal/browser-smoke`.
The verified sender and entitlement are deliberately seeded locally; this does
not verify real email ownership, account linking or provider billing delivery.
The transport implements only the RPCs and simple PostgREST operations needed by
these journeys. Realtime performs authorized connection acknowledgements without
delivering PostgreSQL changes. Storage/TUS objects, signed-URL HTTP expiry,
physical deletion, hosted SMTP, hosted GoTrue behavior and payment-provider flows
remain the separate hosted and future paid gates above. This fresh local schema
does not prove production migration compatibility or backend capacity.

Stop the launcher with Ctrl+C after verification; it closes the local transport
and its Next child. Stop a separately opened `woff-fixture` browser session with
the command above. The launcher intentionally leaves PostgreSQL running for other
local checks. Do not use the fixture database or fixture JWTs in production.
