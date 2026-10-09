# Woff release steps in plain language

Updated October 9, 2026 (Asia/Dhaka). **Public Test checkout is deployed on Vercel at `https://woff.space`**, with no real charges and no added Test-mode notice in Woff. Deployment **`dpl_Cs61knZ73W587HLCjJSVHY8H9vXU`** is READY after its remote build; both reviewed checkout migrations are installed and the missing-configuration admission guard is verified. The actual hosted purchase remains under verification in [launch-readiness.md](launch-readiness.md). Earlier isolated purchase, activation, cancellation, refund and declined-payment checks passed. Free sharing and verified email sign-in remain available; Live payments remain closed.

## What changed

New rooms have an open four-digit code and no time limit. Share contains the visible code controls and optional deadline. Owners can change or generate a code, close code joining, remove a deadline, or revoke all recipient access. A chosen deadline appears in the room's top bar. Activity does not move a chosen deadline. Historical rooms keep their previous expiry and code settings until the owner changes them.

Sign-in and sign-up have separate, redesigned pages while preserving verified account ownership and guest-room transfer safeguards. Pro has checkout review and completion pages, hosted payment, signed webhook handling, capacity admission and a billing portal route. Real Test-mode purchase and signed delivery passed locally. The provider portal itself still requires store activation.

Pro senders can also change a room's display name and direct URL. Use **Share → Room name & URL → Edit**, or **Name & URL** on its dashboard card. For example, choose `woff.space/sabbir-files`; names can use Bengali or other languages, while URL slugs use 3–40 characters with at least one English letter. Numbers and single hyphens are allowed, and an ordinary four-digit code can be kept. Existing members and invitation links keep their access; the old direct URL stops resolving. Editing requires the current Pro plan, and name changes do not affect a room's deadline or allowance.

## Current release choice

Use the existing **WoffNote Share** backend and **woff** website. The owner explicitly chose **no cloud staging and no backup/export now**. Do not create a staging project, purchase a backup or require an export for this release. Preserve real user rooms, files and the verified owner account; this choice does not authorize deleting them.

Local validation, live schema comparison and scoped disposable hosted checks are the agreed procedure. No new manual setup is required for Free sharing. The agent handles the authorized public Test configuration and deployment. Merchant approval, paid storage and hosting decisions remain future Live-sales work.

## Where to do what

| Place | Work |
| --- | --- |
| This repository / local terminal | Review migrations, run tests and build, inspect responsive UI |
| Supabase connector → WoffNote Share | Compare live history/schema and apply only the reviewed new migration |
| Supabase → Authentication | Keep the verified SMTP, confirmation templates, Site URL and anonymous Auth configuration |
| Supabase SQL Editor / connector | Inspect capacity and scoped cleanup queues |
| Supabase Edge Functions, Cron and Vault | Verify scheduled physical cleanup |
| Vercel → woff → Environment Variables → Production | Preserve account/backend settings and add server-only Test payment settings |
| Released website in separate browsers | Check joining, code changes, optional deadlines, files, notes and access |
| Lemon Squeezy dashboard | Keep Test mode, use the existing product, inspect webhook deliveries; merchant documents can remain pending |

The agent can handle code, database configuration, tests and deployment with authenticated access. The owner handles legal identity, bank/tax forms and spending decisions. Keep API keys, server keys, SMTP credentials and webhook secrets out of chat.

## 1. Verify and apply only the new room-access migration

**Where:** Local tests first; then Supabase connector → **WoffNote Share**, project `goitdofpzjjvwgxoykyy`.

Completed: `20261007153006_flexible_room_access.sql` is installed as hosted version **20261007154230** after local regression checks and live preflight. It adds explicit code/deadline state, unlimited-room handling and code history while retaining historical rooms' settings. Do not apply it again. Advisor results and hosted behavior are recorded in the release log.

Completed: `20261008092538_pro_room_identity.sql` is installed as hosted version **20261008094006**. It adds current-Pro ownership enforcement for custom room names/URLs and preserves ordinary Free code joining. Do not apply it again or manually grant Pro as a verification shortcut. Its earlier isolated checks are recorded separately; the new public Test release verifies Pro through an actual signed provider purchase and explicit payment-mode provenance.

Earlier changes are already installed: local `20261003140629_launch_safety_sender_entitlements.sql` is live **20261004070203**; local `20261004070954_fix_entry_insert_returning.sql` is live **20261004071137**. Several older IDs also differ. Do not blindly run `db push`, repair guessed history or replay completed SQL. Never apply local platform bootstrap SQL to hosted Supabase.

## 2. Configure public Test checkout and deploy the matching revision

**Where:** Vercel → **woff → Settings → Environment Variables → Production**, or the authenticated CLI. Editing local `.env.local` does not update production.

| Setting | Public Test release value |
| --- | --- |
| Public Supabase URL/browser key | Existing WoffNote Share project |
| `NEXT_PUBLIC_SITE_URL` | `https://woff.space` |
| `SUPABASE_SERVICE_ROLE_KEY` | Existing server-only credential |
| `CRON_SECRET` | Existing separate cleanup credential |
| `WOFF_ACCOUNTS_ENABLED` | `true` |
| `WOFF_EMAIL_DELIVERY_VERIFIED` | `true`; real Gmail/account flows passed October 4 |
| `WOFF_STORAGE_CAPACITY_VERIFIED` | `false`; additional Live capacity has not been provisioned |
| `WOFF_BILLING_ENABLED` | `true` |
| `LEMON_SQUEEZY_TEST_MODE` | `true`; only simulated provider payments |
| `LEMON_SQUEEZY_API_KEY` / `LEMON_SQUEEZY_WEBHOOK_SECRET` | Existing Test credentials, server-only Secret variables |
| `LEMON_SQUEEZY_STORE_ID` / `LEMON_SQUEEZY_VARIANT_ID` | `492282` / `2224332` |

Keep secrets server-only, without a `NEXT_PUBLIC_` prefix. Vercel's Production environment identifies the public website; it does not make Lemon Squeezy payments Live. Configure Test webhook **140877** to **`https://woff.space/api/billing/webhook`** with the eleven supported events. Deploy the matching app after the reviewed mode-provenance migration and record the actual deployment ID, READY status and hosted payment result. A local `.env` edit alone does not update Vercel.

## 3. Preserve the capacity budget and cleanup

**Where:** Supabase SQL Editor / connector, Storage, Edge Functions, Cron, Vault and host logs.

The shared physical upload admission budget remains **800 MiB**, below the backend's 1 GB Free Storage allowance. It does not purchase capacity or cap bandwidth. The reviewed Test configuration uses `checkout_enabled=true` and `billing_test_mode=true`, with mode provenance on subscriptions and checkout reservations. Test records do not reserve unused Live storage; all actual uploads, unfinished uploads and queued deletions still count toward the same shared physical limit. Live admission still requires a full 1 GiB commitment per active/pending/renewable sender and sufficient headroom.

The `files` bucket remains private with a 50 MiB file limit. Verify `entries` and the new `spaces` subscription are in the Realtime publication. Keep existing authorized cleanup schedules and secrets. Unlimited rooms must survive cleanup; expired rooms, deleted objects and abandoned uploads should be removed through their bounded queues.

The website `/api/cleanup-storage` checks its separate secret, removes only queued UUID prefixes/objects, retains failed work and returns failure counts. Inspect current queue counts before invocation. Never delete a whole bucket or mutate Storage system tables to clean fixtures.

## 4. Check the new room behavior with disposable data

**Where:** Released Woff in separate browsers and read-only Supabase inspection.

Create new test rooms and record their IDs. Preserve any room adopted by the owner or containing real files. Verify:

- Default code joining and invitation joining, with no hidden five-minute timer.
- Changing/generating the code: old code stops joining; existing members and content remain.
- Closing code joining, reopening it, and separately revoking all recipient access.
- Adding/removing a deadline, its top-bar display and preservation during code-only changes.
- Fixed deadlines do not move on message/note edits; expired reads/writes/downloads fail.
- Unlimited rooms and their files remain available past the former inactivity window and are not swept by cleanup.
- Realtime updates, notes/private images, binary/TUS uploads, downloads, export, recovery and mobile/light/dark/keyboard behavior.

File requests retain per-request room/asset authorization. Zero-cache objects may redirect to Storage with a signed lifetime capped at 60 seconds and by any applicable room/file deadline. Legacy or unknown-cache objects stream through an authenticated no-store route. Downloaded copies and earlier cached responses cannot be recalled by later revocation. [Signed URLs and caching](https://supabase.com/docs/guides/storage/cdn/smart-cdn#signed-urls-and-cdn-caching).

## 5. Keep the completed email setup

**Where:** Supabase Authentication and the existing production host settings.

Resend SMTP, sender `noreply@woff.space`, the Site URL, exact `https://woff.space/auth/callback` allowlist, confirmation and manual linking were configured and tested on October 4. The token-hash confirmation page requires a deliberate **Confirm and continue** action. Email sign-in is enabled; no new inbox-confirmation release task is pending.

Use [sign-in](https://woff.space/sign-in) for an existing account or [sign-up](https://woff.space/sign-up) to create one. Request the email and confirm in the requesting browser promptly if it has guest rooms to transfer. Used or expired links require a fresh request. This is ordinary account use, not another release gate.

## Why staging and backup were discussed

Staging is a separate rehearsal website/database. Backup is a restorable copy of rows and files. Git preserves code, not database content or uploaded bytes. They help reduce release/recovery risk, but the owner chose to skip them now. Follow that choice using local validation and scoped hosted checks; no paid cloud branch, backup or staging project is required.

The public Test checkout uses Vercel's always-available webhook route. No local terminals or tunnel are needed for the owner. Isolated local checks remain optional diagnostics; do not repoint the public Test webhook to their temporary callback. A mock test alone does not prove real provider delivery. Revisit recovery arrangements later if valuable customer data or paid obligations grow.

## Owner steps for test checkout only

The complete walkthrough, fees, exact events and environment variables are in [pro-checkout-setup.md](pro-checkout-setup.md).

Current decision, October 9: deploy on the existing Vercel project with **public Test checkout and no real charges**. The deployment is READY and its hosted purchase is under verification. No commercial-hosting purchase, storage migration, cloud staging or backup is requested. Existing store document issues can remain unresolved during Test purchase use.

1. **Completed by the owner:** store **492282** uses **USD** and Test-mode variant **2224332** is **$8.00 every 1 month**, with standard subscription pricing and no trial, setup fee or usage pricing. The agent verified the actual API values; no credential needs to be sent again.
2. **Completed by the agent:** actual no-charge purchase and signed Pro activation; cancellation retaining access through the paid deadline; full refund returning the account to Free; a declined new purchase retaining Free without a provider subscription; duplicate callback and synthetic stale-event handling; and refusal of another checkout for the existing subscription. Separately, 31 billing/checkout checks, nine SDK/backend checks and six HTTPS receiver checks passed. The declined checkout's pending reservation expires automatically; no recurring subscription was created for it.
3. **Portal test still blocked:** Manage billing reaches Lemon Squeezy, but the provider refuses access because the store has not been activated. To finish this test, use **Activate your store** in Lemon Squeezy, provide the real merchant information it requests, and wait for approval. This is not required for Free sharing, and it does not authorize a paid hosting plan or live charges. Actual renewal/expiry and further provider lifecycle checks remain future coverage.

For the new public release, Test webhook **140877** targets **`https://woff.space/api/billing/webhook`**. The earlier local tunnel is optional diagnostic history. New hosted Test subscriptions can unlock Pro controls only after signed account reconciliation and retain their mode; they cannot grant Live Pro after a future switch. The ended-access correction and shared primary-button styles are included in the READY deployment; final hosted verification is recorded separately from earlier local checks.

**Deferred until real sales:** Live merchant/payout approval and distinct Live credentials; actual capacity for **1 GiB per paid/pending/renewable sender plus Free headroom**; and hosting arrangements for paid operation. The current shared 800 MiB budget supports the bounded Test path, not a Live storage guarantee. The reviewed mode-provenance policy prevents simulated purchases from becoming Live access; it does not enlarge storage.

Lemon Squeezy has no monthly processing subscription fee; it charges transaction/payout fees. The published **$50 payout threshold** exceeds the five-user pilot's **$40 monthly gross ceiling**, so the first month's sales alone will not fund infrastructure immediately. See the linked setup guide for the current fee example and authoritative sources.

No manual task is left for Free configuration. The agent handles this authorized public Test release. Store activation is the remaining owner task for the provider portal or eventual Live sales and can be deferred now. No Live charges or infrastructure purchase is authorized.

To pause later, set `WOFF_BILLING_ENABLED=false` and the private `checkout_enabled=false`, then redeploy while retaining accounts, signed reconciliation, downloads and cleanup. A pause does not cancel existing subscriptions. To switch to Live when requested, pause admission, resolve outstanding Test checkouts/subscriptions, supply distinct Live credentials/webhook, set server and database payment modes to false, verify actual paid-storage capacity and reopen after checks. Test-origin records normalize to Free in Live mode and stay available for audit; do not delete rooms/files or reuse Test subscription IDs.
