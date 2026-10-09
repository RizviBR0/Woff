# Woff launch and first-revenue plan

Prepared October 3, 2026 against checkout `61720bc`; scope updated October 7. Business owner: Bangladesh; intended audience: international. Historical findings are retained below, with current verification in [launch-readiness.md](launch-readiness.md). The owner chose no cloud staging or backup now and requested checkout implementation, refreshed account pages and simpler open-room controls. Live checkout activation remains deferred to merchant, capacity, commercial-hosting and provider verification.

**Objective:** make the existing free sharing experience trustworthy, then launch one small paid sender product for freelance designers/developers delivering project files and instructions to clients. Preserve the current design. Expand only after paid repeat use and positive operating contribution justify the next investment.

This is the implementation sequence for the earlier [income analysis](/E:/Woff/docs/monetization-analysis.md). Where its broader feature proposals differ, this document defines the narrower first release. Prices, quotas, and pilot targets below are proposed experiments, not proven demand or income forecasts.

## 1. Decisions that keep the work bounded

- Keep anonymous free sharing and account-free receiving. Optional verified sender accounts provide durable ownership. Never require a recipient to subscribe to download a delivery.
- New rooms have open four-digit codes and no deadline. Owners can set/remove a time limit, change/generate a code, close code joining and revoke recipient access. This explicit October 7 request supersedes the earlier mandatory five-minute pairing design. Historical rooms retain their prior settings until the owner changes them.
- Offer Free and one monthly Pro plan. Test **$8/month**; defer annual billing, Teams, one-room passes, donations, advertising, and affiliate monetization.
- Keep the existing **50 MiB/file and 20-files/batch application limits** during this release. Larger files require separate transport, quota, memory, and provider validation.
- Keep Supabase Auth, Database, and Realtime. Start with the current Storage integration; move new file bytes to R2 only at the capacity gate in section 7. An R2 migration is conditional infrastructure work, not a prerequisite for polishing the public site.
- Retain the note editor's implemented autosave, conflict handling, draft recovery, focus mode, rich/Markdown editing, image tools, and Print/PDF. Earlier editor documents contain historical descriptions; they are not a request to rebuild completed work.
- Complete identity, entitlements, billing, support policies, and the small paid feature bundle together before enabling checkout.
- Use existing components and styling. New features need clear loading, empty, denied, expired, failed, retry, and success states.

## 2. Historical evidence and current verification limits

The October 3 baseline contained the homepage, notepad, four additional utility landing routes, About, Contact, Privacy, Terms, blog index, 19 articles with covers, room/note routes, and error/loading/not-found states. Pricing, sender account management, a multi-room dashboard and subscription flows were missing then; those interfaces and billing integration are now implemented. Utility pages have distinct content. October 4 verified Free sharing and email/account flows. The October 7 source changes require the new evidence area in [launch-readiness.md](launch-readiness.md); real provider purchase/webhook verification remains pending configuration.

Checks run for the original October 3 plan:

| Check | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npx tsc --noEmit --incremental false` | Passed |
| `npm run build` | Passed; 37 static pages generated |
| `node --test scripts/performance.test.mjs` | All 4 existing tests passed |

Those original tests cover bounded ZIP concurrency, error handling, cancellation and native individual download dispatch. Later database/browser/hosted evidence is recorded separately in the release log. Do not treat a historical test or local provider mock as proof of today's production revision or actual payment delivery.

## 3. Prioritized defects and unfinished contracts

P1 means fix before paid launch; P2 means include in the public-site/quality pass. This is the historical defect inventory against the October 3 checkout, not a claim that all of these defects remain present. Fixes and evidence are recorded in the release log. B06 and the expiry contract below reflect the owner's superseding October 7 request.

| ID / priority | Finding and evidence | Required fix | Acceptance check |
| --- | --- | --- | --- |
| B11 / P1, historical expiry gap | Earlier entry/asset/Storage policies omitted room deadlines and activity could renew an expired room. [Historical policies](/E:/Woff/supabase/migrations/20260815065609_add_ephemeral_extension_files.sql:227). | Enforce optional deadlines in all reads/writes/files/cleanup. New rooms have no deadline; chosen deadlines are fixed. Only historical inactivity rooms renew on meaningful activity until the owner changes that mode. | Expire a disposable isolated room without cleanup: reads/writes/recovery fail. Unlimited rooms remain available and survive cleanup. |
| B12 / P1, code-confirmed privacy gap | Locked-note image assets have membership-only access rules; the file route also lacks note-lock authorization. [Storage policy](/E:/Woff/supabase/migrations/20260815065609_add_ephemeral_extension_files.sql:239), [file route](/E:/Woff/app/api/files/[...path]/route.ts:18). | Apply the note's privacy rule to asset rows, Storage reads, and signed-URL issuance. Audit embedded assets and thumbnails as part of the same boundary. | After an owner locks an image-containing note, another member cannot obtain new asset URLs through API or direct Storage access. Owner access works. Previously issued URLs expire within the documented short TTL; downloaded copies cannot be revoked. |
| B01 / P1, code-confirmed | Lock/unlock calls `updateNote`, which increments the stored version, but ignores its returned version; autosave retains the old version. [Editor](/E:/Woff/components/note-editor.tsx:795), [action](/E:/Woff/lib/actions.ts:559). | Serialize lock changes with content saves, apply returned version/state, and prevent overlapping metadata mutations. Preserve genuine cross-tab conflict detection. | Type, lock/unlock, type again, and reload; content saves without a false conflict. Repeat while a save is delayed and in two tabs. |
| B13 / P1, code-confirmed conflict-recovery defect | Force overwrite increments the local version by one, so it fails again when the remote note advanced multiple versions. [Overwrite handler](/E:/Woff/components/note-editor.tsx:884). | Fetch the current remote version and perform an explicitly confirmed conditional overwrite. Preserve the local draft if another concurrent update wins. | One tab saves twice; a stale tab edits and chooses overwrite. The intended save succeeds or presents a genuine new conflict without losing the draft. |
| B02 / P1, code-confirmed | Recovery changes room ownership, while note saves authorize the original note author. [Recovery SQL](/E:/Woff/supabase/migrations/202607230001_secure_anonymous_platform.sql:596), [save SQL](/E:/Woff/supabase/migrations/20260930174941_transactional_note_save.sql:29). | Define recovery as restoring the previous owner's content rights in that room. Transfer only that owner's relevant authorship/asset rights transactionally; preserve other participants' content ownership. Rotate the recovery secret. | A fresh session recovers its room and edits its old notes/files; it cannot edit another participant's notes or take unrelated rooms. Paid purchases require account verification, not just a room recovery key. |
| B03 / P1, historical database-policy gap | Earlier owner UPDATE permissions left expiry/activity fields directly writable. [Historical guard](/E:/Woff/supabase/migrations/202607230001_secure_anonymous_platform.sql:874). | Keep deadline, code and entitlement fields server-controlled through owner-checked RPCs. Free owners can intentionally set/remove a deadline through the supported controls. | Direct table updates and nonowner RPCs fail; an owner can update their own code/deadline without acquiring Pro. |
| B04 / P1, cost-control gap | Latest reservations cap a file/batch but omit cumulative quotas. Publication trusts reservation/client sizes; object replacement needs equivalent quota controls. [Latest upload rules](/E:/Woff/supabase/migrations/20260723180701_set_file_upload_limit_to_50mb.sql:63). | Enforce atomic room/account reservations; validate actual stored object size before publication; make object keys immutable or reserve replacement capacity. Count inline images, markup copies, pending uploads, and retained files. | Parallel uploads cannot exceed quota; declared/actual size mismatch fails; retries do not double-count; cancellation/deletion releases logical allowance and physical cleanup is verified. |
| B05 / P1, incomplete feature/copy defect | Lock dialog promises recipient passcode access, but recipients have no unlock flow and verification only accepts the owner. [Dialog](/E:/Woff/components/note-editor.tsx:2314), [verification](/E:/Woff/lib/actions.ts:827). | For this release define the feature as **owner-only private note**, remove the misleading passcode promise/input, and retain server-enforced hiding. Defer recipient password sharing. Existing locked notes remain private. | Owner/guest, direct note/API/file paths, realtime, exports, and embedded assets obey the same privacy contract. A lock icon alone is insufficient. |
| B06 / P1, access contract updated October 7 | Four-digit codes have a small search space and finite allocation pool. The owner explicitly requested open code joining without a hidden five-minute window. | Offer open code joining by default, visible close/change controls, optional deadlines, opaque invitations and full recipient revocation. Reserve retired codes while their room exists and keep server attempt limits. Do not describe an open code as private authentication. | Code joining works until explicitly closed or the room expires; old codes fail after change; existing members/content survive code changes; revoked grants fail across database/file/note paths. Historical rooms retain their access settings. |
| B07 / P2, code-confirmed export defect | Activity-sidebar PDF paths strip HTML and use Helvetica, losing formatting/images and lacking Bangla glyph coverage. [Sidebar](/E:/Woff/components/activity-sidebar.tsx:713). | Reuse the editor's browser Print/PDF route for individual rich notes. For bulk ZIP use an explicitly labelled Markdown/HTML export with included assets or clear limitations; avoid promising rich batch PDF in this release. | Bangla/English, lists, headings, images, and code work in the supported export. Locked/unavailable notes fail clearly; ZIP never silently omits promised content. |
| B08 / P2, code-confirmed metadata defect | Internal `/blog/tips` is noindex but included in sitemap. Leaf titles duplicate the global brand suffix. [Sitemap](/E:/Woff/app/sitemap.ts:18), [title template](/E:/Woff/app/layout.tsx:26). | Move editorial strategy into docs; remove its route from sitemap. Normalize leaf titles and public canonicals. | Sitemap contains only canonical indexable public URLs; each title has one brand suffix; room/note/account pages stay noindex. |
| B09 / P2, code-confirmed accessibility defect | Invisible navbar CTA remains keyboard-focusable; menu toggle lacks expanded/control state; homepage lacks a main landmark. [Navbar](/E:/Woff/components/navbar.tsx:112), [home](/E:/Woff/app/page.tsx:7). | Fix hidden control semantics, menu state, main/skip navigation, and focus behavior without a visual redesign. | Keyboard/screen-reader traversal has no invisible stops, menus announce state, and focus remains visible at mobile and desktop sizes. |
| B10 / P2, content accuracy defects | Some blog/product copy promises room passwords, live cursors, or collaborative note editing that are not implemented; the “best tools” article lacks the promised concrete comparison. [Blog](/E:/Woff/lib/blog.ts:529), [note card](/E:/Woff/components/entries/note-entry-card.tsx:97). | Rewrite claims to match tested behavior; retitle unsupported comparisons or research actual named alternatives; remove unsupported metrics and guarantees. | Every published capability maps to a working journey. Displayed dates reflect real publication/revision; existing article URLs remain valid. |

**Investigations, not confirmed production bugs:** test whether analytics loaded on a public page continues reporting after client navigation into a private room; test slow uploads that outlive the 30-minute reservation and reload/retry behavior; stress browser ZIP memory at the intended cap; measure navbar overflow near breakpoints. See [analytics](/E:/Woff/components/privacy-safe-analytics.tsx:7), [uploader](/E:/Woff/components/composer.tsx:338), and [ZIP implementation](/E:/Woff/lib/archive.ts:33). Resolve any data-loss/privacy failure before launch. Future scheduled posts also need related-article filtering by publication date; all current articles are already dated in the past.

## 4. Execution order and release gates

| Batch | Work to complete | Dependency and completion gate | Planning effort |
| --- | --- | --- | --- |
| A — Baseline and feasibility | Capture current visual baselines; confirm actual deployment/schema and cleanup scheduling; record usage/bills; verify provider onboarding and bank-payout path; observe 5 real client handoffs with about 10 target users. | One prioritized bug list, provider decision, actual cost baseline, and evidence that the proposed sender workflow is useful. Start provider review early while engineering proceeds. | 1–2 focused days, plus external review time |
| B — Correctness and cost controls | B11–B12 expiry/asset privacy first, then B01–B05 and B13; authoritative quota accounting; reliable cleanup/retry; investigate private-route analytics and slow-upload failures. | Regression checks pass in isolated fixtures; no known P1 content-loss, cross-user access, or unbounded storage-accounting defect remains. | 5–8 days |
| C — Sender ownership and access | Optional verified email sign-in; production SMTP/domain configuration and delivery testing; preserve anonymous identity when linking; safe existing-account merge; B06 secure invitations; enforce owner/recipient roles and revocation. | Sign-in emails deliver reliably, expired links recover clearly, and a second device restores the same owned rooms. No paid entitlement depends on localStorage or a browser cookie alone. Direct writes and stale grants are tested. | 5–8 days |
| D — First paid workflow | Named rooms, dashboard, welcome instructions, one reusable handoff template, read-only delivery mode and usage indicators. Optional deadlines are available to Free too; Pro templates can apply 7/30-day defaults. Evaluate section 7's storage gate before enabling promised capacity. | A pilot sender can create, reuse, manage, deliver, close, and export a real project; recipient completes it without an account. | 4–7 days |
| E — Billing and customer support | Server-side subscription entitlements; hosted checkout and provider portal; verified/idempotent webhooks; payment failure/refund/cancellation behavior; receipt/support/policy content. | Sandbox lifecycle passes; provider approves the store/payout setup; production hosting permits commercial use; real checkout enabled only after B–D are ready. | 4–6 days, excluding provider delay |
| F — Public site and content | B07–B10; help/pricing/handoff pages; truthful homepage/utility copy; blog repairs and focused guides; mobile/accessibility polish. | Navigation, metadata, content accuracy, light/dark views, and public CTA journeys pass. Pricing actions reflect actual availability. Can run alongside C–E after contracts are settled. | 3–5 days |
| G — Controlled paid pilot | Invite roughly 10 qualified senders; observe onboarding and at least one full billing/usage cycle; fix issues surfaced by use; review costs weekly. | Target 3 paying senders and at least 2 repeat users within 14 days, with reliable delivery and positive per-account contribution. Treat missed targets as a signal to revisit offer/positioning. | 2–4 calendar weeks of observation |

These estimates are planning ranges, not deadlines. Allow roughly **5–8 focused development weeks** for the implementation batches with one developer, plus pilot/provider time. Conditional R2 migration adds approximately **4–7 focused days**, subject to mixed-storage and failure-path testing. Re-estimate after Batch B; quality gates take precedence over calendar dates.

**First implementation batch:** close expired-room and locked-asset access gaps, fix note lock/save and overwrite behavior, restore safe recovery, and close retention/quota authorization gaps. Public copy can be corrected in parallel. Do not start with a new visual design or a large storage rewrite.

## 5. The smallest coherent paid offering

| Capability | Free | Pro pilot |
| --- | --- | --- |
| Basic files, text, code, images, notes and QR | Keep existing functionality | Included |
| File/batch size | Existing 50 MiB/file, 20 files/batch | Same during pilot |
| Room lifetime | New rooms have no deadline; owner can set/remove an optional fixed limit | Same lifetime controls; saved templates can apply a 7/30-day default |
| Ownership | Anonymous with recovery; optional account linking | Verified sender account and cross-device access |
| Organization | Basic access to owned free rooms when signed in | Named client rooms, dashboard search and usage/expiry states |
| Client delivery | Existing sharing room | Read-only recipient mode, welcome instructions, one reusable handoff template |
| Access controls | Open code by default, change/close controls, opaque invitations, deletion and recipient revocation | Same access controls |
| Proposed storage | 200 MiB per room; signed-in free account 400 MiB total | 1 GiB per sender total, up to 10 active Pro rooms |
| Price | $0 | Test $8/month; show applicable tax at checkout |

All proposed quotas must be validated against traffic, provider capacity, and actual file sizes before publication. An owner's usage includes every asset in their rooms, including participant uploads and generated previews, plus active reservations. Serialize competing reservations against the same owner's allowance. Anonymous limits also need service-level rate/abuse controls; a person can create multiple anonymous identities. "No time limit" describes the absence of an automatic room deadline, not unlimited storage/transfer, a guaranteed permanent archive or guaranteed download speed.

Start with at most **5 paid pilot accounts**. If using R2's free allowance, use an internal physical-storage headroom target around **7 GiB** and reserve the full 1 GiB allowance for each admitted paid account. Five accounts leave approximately 2 GiB for free/anonymous rooms, legacy files, abandoned uploads, and cleanup backlog. Free-upload admission must respect that reserved capacity; stopping new paid onboarding alone is insufficient. This is an initial operating target, not R2's billing unit or a guaranteed zero bill. Pause new onboarding or fund additional capacity before existing customers' promised allowances are threatened.

The smaller 1 GiB Pro pilot and unchanged per-file limit intentionally replace the earlier speculative 5 GiB/500 MiB proposal. Charge for repeated client-delivery convenience first. If pilots will only pay for large transfers, revisit scope and costs before building an unsuitable bundle.

Implement room mode, optional `expires_at`, `expiry_mode`, `code_enabled`, owner identity and subscription entitlements as explicit server-authorized data. A room's `is_pro` flag is insufficient as billing authority. Read-only mode restricts all recipient mutation paths. An enabled code permits joining; closing it blocks new code admission, while full revocation invalidates existing recipient grants and closes the code. Update URL parsing, QR sharing, browser recovery state and UUID-based reconciliation together when codes change.

At cancellation, Pro remains active through the paid-through date. Afterwards prevent new Pro-only actions and show any over-quota state; preserve the owner's chosen room deadline or no-deadline mode and allow export/deletion. Never suddenly delete paid work because a webhook is delayed. Define payment-failure grace, refunds, and access changes in the same policy and tests. Hard revocation invalidates grants; changing a room code alone preserves existing memberships. Document the maximum lifetime of already-issued signed file URLs.

## 6. Pages, blog work, and design constraints

| Page/area | Exact first-release scope |
| --- | --- |
| Existing homepage | Keep create/join prominent; accurate limits/retention/privacy; add one discreet client-handoff path. Show only substantiated statistics. |
| Existing four utility pages | Preserve URLs; give each a relevant example, short workflow, limits, and matching create action. Reuse shared sections instead of copying the entire homepage. |
| New `/help` | One guide with anchors for create/join, recovery, note ownership/privacy, uploads/retries, expiry, download/export, and troubleshooting. Link to existing Contact. |
| New `/pricing` | One Free/Pro comparison, exact allowances, retention, cancellation/refund links, recipient-free explanation. Before launch show clear availability; enable purchase only when the paid flow works. |
| New `/for-freelancers` | One client-handoff page with an actual example and matching template action. No asset-collection promise. |
| `/sign-in`, `/sign-up` and `/auth/callback` | Distinct account entry pages, verified identity, clear return paths, expired-link/error recovery and safe anonymous-to-account transitions. |
| New `/dashboard` | Owned rooms, names, search, mode, expiry, usage, create/reuse, close/delete, and all empty/error/loading states. |
| `/account`, `/checkout`, `/checkout/complete` | Profile/email, subscription state, provider billing portal, purchase review, pending/success confirmation, cancellation, export/deletion/support. Never grant Pro from the return URL. |
| Existing About/Contact/Privacy/Terms | Reflect optional accounts/billing and actual data handling; add acceptable-use, refund/cancellation, and retention/deletion sections. Publish only response times the owner can meet. Separate refund page only if provider review requires it. |
| Existing blog | Retain current layout and all valid public slugs/covers; correct misleading claims across 19 posts; improve the strongest guides first. |

For the blog, prioritize the existing no-login notes, cross-device text, and code-sharing guides: real screenshots, exact steps, useful examples, present limits, recovery/expiry guidance, related links, and a relevant action. Remove internal `CTA:` authoring labels from rendered prose. Consolidate repeated claims rather than adding padding. Use genuine `updatedDate` values, correct article metadata, heading IDs, and a sitemap that excludes internal/private content.

After corrections, publish at most three focused articles for the pilot: **deliver a website project with files and instructions**, **prepare a design handoff checklist**, and **recover/export a temporary sharing room**. Only describe the paid workflow once shipped. Keep content in the repository; a CMS, newsletter system, blog search/filter rebuild, and bulk SEO-page generation can wait.

Preserve monochrome light/dark tokens, orange `#ff5a00` accents, Inter/Almarai typography, rounded cards, subtle grid/glow backgrounds, existing Navbar/Footer, Radix components, and the current editorial blog layout. The global `--primary` token intentionally switches black/white; do not change it wholesale to orange. Reuse spacing/type/button patterns on new pages. Add semantics, responsive fixes, readable contrast, reduced-motion support, and visible focus within this design.

Visual acceptance: compare before/after views at **375, 768, and 1280 px** in light/dark modes plus system-theme switching. Cover home, room, note, blog/article, help, pricing, dashboard, and account; verify menus, mobile keyboard, touch targets, text scaling, and overflow. No theme replacement or editor-toolbar redesign is in scope.

## 7. Infrastructure and payment gates

**Storage:** measure physical stored bytes, pending deletions, upload success, transfer failures, and cached/uncached egress separately. Continue with Supabase Storage while comfortably within capacity. Prepare R2 when growing storage reaches about **700–800 MB**, projected monthly usage reaches **3.5–4 GB of either 5 GB Supabase egress allowance**, or the planned paid allowances will exceed available capacity. These are planning thresholds, not provider limits. A single 1 GiB paid allowance cannot be promised against an otherwise full 1 GB Supabase Free project.

If triggered, choose R2 Standard and retain Supabase for the backend. Add provider metadata to assets, upload intents, and deletion queues; route new uploads to private R2 while old objects remain readable. Implement direct signed browser transfers and resumable multipart upload; validate actual completion; adapt cancellation, inline note images, markup, and both cleanup jobs. Account for abandoned multipart uploads and retries. Existing Pro/active legacy rooms may retain files, so do not assume all Supabase objects expire in 48 hours. Update CORS/CSP and test Range/download filenames. Avoid a public bucket for private content.

Add a Worker for authenticated cached delivery only if measured benefit warrants it; count its own quotas/costs. Benchmark Local Uploads beta for distant users if available. Never claim R2 guarantees faster worldwide transfer. R2's published monthly free allowance is 10 GB-month Standard storage, 1 million Class A operations, 10 million Class B operations, and no internet-egress fee; operations and additional services can still be billed. [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [Local Uploads](https://developers.cloudflare.com/r2/buckets/local-uploads/).

**Immediate performance work:** preserve direct TUS uploads and native individual downloads. Benchmark and remove unnecessary app-server relay for preview/ZIP fetches while retaining authorization and compatible browser CORS. Generate small previews; lazy-load offscreen media; preserve Range support and cancellation. Verify the actual deployment uses the intended Singapore region. Record reproducible transfer/startup measurements rather than asserting a percentage speedup.

**Payments from Bangladesh:** the Lemon Squeezy integration is implemented, with live sales closed. The provider has no monthly processing subscription fee, takes transaction/payout fees and lists Bangladesh for bank payouts. Obtain actual store/product and payout approval. Test real purchases/webhooks against an isolated local backend via a temporary HTTPS tunnel; cloud staging is not required. Paddle is a fallback to investigate if approval fails. See [Pro setup](pro-checkout-setup.md) for exact fees, owner steps and test/live separation. [Supported countries](https://docs.lemonsqueezy.com/help/getting-started/supported-countries), [store activation](https://docs.lemonsqueezy.com/help/getting-started/activate-your-store), [Paddle eligibility](https://www.paddle.com/help/start/intro-to-paddle/which-countries-are-supported-by-paddle).

**Hosting — deferred for the current Free launch:** On October 9, the owner chose to keep the current host and prepare no-charge Test mode checkout. Do not purchase or migrate hosting for that step. Before future real sales, revisit the host's commercial-use terms and actual storage capacity using the [hosting/storage options and sources](pro-checkout-setup.md). Verify Next.js/auth/webhook/cleanup compatibility before any domain move and obtain the owner's choice before a billable change. The owner has waived backup and cloud staging now; revisit recovery arrangements later as customer data and obligations grow.

Configure usage alerts and explicit service-side limits; billing alerts alone are not a hard spending cap. Prepare a support/admin procedure to inspect entitlements and retry failed cleanup without building a large admin dashboard.

## 8. Definition of ready to charge

- A sender can create anonymously, link a verified identity without losing work, return on another device, and manage their own rooms. Account linking cannot claim another user's content. Recovery keys cannot transfer subscription ownership.
- Upload/resume/retry/cancel, inline images, Unicode names, individual download, note export, and ZIP are tested across owner/recipient/expired/revoked states. A failed upload never becomes a successful published entry.
- Lock/save, recovery, quota concurrency, actual-byte accounting, direct API retention edits, read-only mutations, and revoked grants have regression coverage. Test fixtures are isolated and cleaned by recorded IDs.
- Subscription purchase, duplicate/delayed/out-of-order webhooks, renewal, failed payment, cancellation, refund, portal access, and new-device recovery pass in provider test mode. Store/payout onboarding is approved before live sales.
- Displayed optional expiry matches server enforcement; expired access stops promptly; unlimited rooms survive cleanup; cleanup retries remove physical objects and expose failures. Verify a compatible rollback/pause route. Cloud staging and backups are not gates for this owner-authorized release.
- Public pages and billing policies match the product; private URLs/content are excluded from third-party analytics and search indexing. Test public-to-private navigation with network inspection before making privacy claims.
- Lint, typecheck, production build, targeted automated tests, and essential browser journeys pass. Test mobile Safari/Chrome behavior and current desktop browsers; emulate where necessary and record coverage limits.
- Use feature flags for new billing and room modes; apply additive schema migrations and backfill safely. Pilot with a small cohort, retain old storage/read paths, and rollback by stopping new paid checkouts while preserving existing customers' access and exports.

## 9. Measure revenue without expanding scope prematurely

Record minimal first-party product events such as room creation, upload completion/failure, share action, authorized download initiation, repeat sender use, checkout, and renewal. Do not call a redirected download “completed” unless completion is measured. Avoid event payloads containing note text, filenames, room codes, invitation tokens, or private URLs. Keep operational quota accounting distinct from aggregate marketing analytics.

Review activation, repeat use, paid conversion, failed transfers, refunds/cancellations, support effort, physical storage, and delivery cost. Calculate operating contribution after payment fees, hosting/storage/email, refunds, and support costs; gross subscription receipts are not profit. Start with product observation and direct pilot recruitment; paid advertising is outside this release.

After **two consecutive months of positive operating contribution and recurring paid use**, choose one additional feature justified by customer requests and costs. Candidate order: larger-file support if transfer sizes block sales; upload-only client requests if collection is the repeated need; branding/templates if presentation drives renewals. This financial gate is an operating signal, not a claim that taxes and owner labor have already been covered.

Deferred: Teams/seats, client approvals/comments, real-time coediting, AI features, video processing, public API/integrations, custom domains, a full CMS, native apps, enterprise claims, extensive branding, and the browser extension until its source/release is available and demand supports it. Security fixes, reliability work, and required support continue regardless of profitability.

## 10. Implementation checklist

The checklist includes implementation, targeted verification, merchant approval and business validation. October 4 evidence is recorded in [launch-readiness.md](launch-readiness.md); October 7 changes need their own results. Cloud staging and a backup are omitted by the owner's instruction. No new manual Free gate is introduced; Pro activation still needs the actual provider/capacity/commercial-hosting prerequisites.

- [ ] A: Confirm live configuration/costs, capture design baseline, validate provider and pilot demand.
- [ ] B: Fix B11–B12, B01–B05, and B13; pass expiry, privacy, save, recovery, authorization, quota, and cleanup regressions.
- [ ] C: Ship durable sender identity, secure invitations, and tested account transitions.
- [ ] D: Complete the small client-handoff workflow and validate advertised storage capacity.
- [ ] E: Complete and test provider billing, entitlements, cancellation/refund/support behavior.
- [ ] F: Ship necessary pages, content corrections, exports, accessibility, and theme-preserving polish.
- [ ] Conditional: Migrate file storage only when section 7's capacity gate requires it.
- [ ] G: Enable the approved paid pilot, observe repeat use and costs, then choose the next investment.

The paid pilot is the endpoint of this plan. Each batch should ship as a small reviewable change with its named acceptance evidence; future revenue features require a new scope decision supported by actual usage.
