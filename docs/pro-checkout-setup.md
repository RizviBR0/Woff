# Enable Woff Pro checkout

## Current scope — October 9, 2026

The owner now requests **public checkout on `https://woff.space` using Lemon Squeezy Test payments**, with no real charges. Use the existing Vercel **woff** project and WoffNote Share backend. No cloud staging, backup, hosting purchase or storage migration is requested. The website keeps its normal checkout design without an added Woff Test-mode notice; Lemon Squeezy controls its own hosted payment screen.

The owner completed the currency and price correction. API checks confirm store **492282** uses **USD**, and Test-mode variant **2224332** is a standard **$8 every 1 month** subscription without a trial, setup fee or usage pricing. Server-only Test credentials and `LEMON_SQUEEZY_TEST_MODE=true` are configured in Vercel's **Production environment**. Deployment **`dpl_Cs61knZ73W587HLCjJSVHY8H9vXU`** completed its remote build and is **READY with the `woff.space` alias**. Both reviewed checkout migrations are installed; the missing-configuration admission guard is verified. Production here identifies the public deployment target; payment mode remains **Test**, not Live. The actual hosted purchase is still being verified; results belong in [launch-readiness.md](launch-readiness.md).

Earlier isolated verification on October 9 passed **31 billing/checkout checks**, scoped lint and TypeScript. Separately, **nine local backend checks** and **six HTTPS receiver checks** passed. Actual provider testing confirmed purchase-to-Pro activation, cancellation retaining access, a full refund returning the account to Free, a declined new purchase staying Free, duplicate handling and rejection of another checkout for an existing subscription. A signed synthetic stale event also left the account unchanged. Those results describe the earlier local setup, not the new hosted release. The customer portal remains blocked because the provider store is not activated.

Lemon Squeezy is a reasonable fit for this Bangladesh-based SaaS: payment processing has no monthly subscription fee, Bangladesh is listed for bank payouts, and international customers can pay where the provider supports purchases. It still takes transaction fees and must approve the store. Country support does not guarantee individual approval or successful bank onboarding. [Pricing](https://www.lemonsqueezy.com/pricing), [supported merchant and customer countries](https://docs.lemonsqueezy.com/help/getting-started/supported-countries).

The integration provides `/checkout`, hosted payment, signed notifications, `/checkout/complete`, account status and a customer billing portal route. For this release, Test webhook **140877** must send its eleven implemented events to **`https://woff.space/api/billing/webhook`**. Vercel serves the receiver continuously; the owner does not need a local app, three terminals or a tunnel. The shared physical upload admission budget stays **800 MiB**. Test subscriptions and checkout reservations retain their payment-mode provenance; they do not reserve an unused 1 GiB of paid storage, and their actual uploads still count against the shared physical limit. Live admission continues to require the full storage commitment and verified capacity.

## Future Live sales: cost of an $8 subscription

| Charge | Current published rate |
| --- | --- |
| Base processing | 5% + $0.50 per transaction |
| Subscription payment | Additional 0.5% |
| International transaction, outside the US | Additional 1.5% |
| PayPal transaction, if used | Additional 1.5% |
| Bank payout outside the US | 1% of the payout |

For an $8 international card subscription with no tax added, processing is approximately $1.06, leaving $6.94 before the separate payout fee and any other applicable costs. Fees are calculated on the total order value, including tax when charged, so this is an example, not a guaranteed payout. Sales tax, refunds and chargebacks can change the amount received. [Fee details](https://docs.lemonsqueezy.com/help/getting-started/fees).

The payout threshold is **$50**. The initial five-customer limit generates at most **$40 gross per month**, so one fully subscribed month by itself cannot reach the payout threshold. Funds accumulate for a later eligible payout; do not depend on immediate revenue to fund infrastructure. [Payout schedule and threshold](https://docs.lemonsqueezy.com/help/getting-started/getting-paid).

## 1. Merchant activation for the portal and future Live sales

**Where:** [Lemon Squeezy dashboard](https://app.lemonsqueezy.com/).

1. Create or sign in to the store for Woff. New stores begin in Test mode. The existing Test store is already configured; activation can remain pending during this no-charge release.
2. Choose **Activate your store** in the sidebar. Describe the real SaaS, website and customers; complete the required identity verification. The owner must supply the legal identity and accept the merchant agreement.
3. Open **Settings → Payout** and connect the owner's supported bank account using accurate Bangladesh details. Complete any tax or additional identity forms requested by the provider.
4. Wait for the actual approval result. Test-mode integration can proceed while review is pending. [Activation instructions](https://docs.lemonsqueezy.com/help/getting-started/activate-your-store), [bank payout setup](https://docs.lemonsqueezy.com/help/getting-started/getting-paid).

## 2. Create the test subscription

**Where:** Lemon Squeezy, with **Test mode** selected, **Products → New Product**.

1. Name the product **Woff Pro** and describe the included room features and storage accurately.
2. Select **Subscription**, standard pricing, **USD $8.00**, repeating every **1 month**.
3. Keep one monthly variant. Disable trial, setup fee and usage-based pricing. Do not enable adjustable quantity or extra variants for this offer.
4. Publish the test product. Record its **store ID** and **variant ID**, not the product ID or a public checkout link. The API can retrieve these IDs if the dashboard does not display them.
5. Keep purchases starting inside Woff. A standalone product buy-link omits Woff's account binding and capacity reservation. [Subscription setup](https://docs.lemonsqueezy.com/guides/tutorials/saas-subscription-plans), [checkout API](https://docs.lemonsqueezy.com/api/checkouts/create-checkout).

## 3. Configure test API access and webhooks

**Where:** Lemon Squeezy **Settings → API** and **Settings → Webhooks**; Vercel **woff → Settings → Environment Variables → Production**.

1. Use the existing Test API key. Keep it in a server-only Secret environment variable; do not put it into source code or browser configuration.
2. Retain the existing WoffNote Share credentials, `NEXT_PUBLIC_SITE_URL=https://woff.space`, and verified email/account settings. Set `WOFF_BILLING_ENABLED=true` and `LEMON_SQUEEZY_TEST_MODE=true` for the public Test checkout. The separate Live-storage verification flag remains false because no additional storage was purchased.
3. Install the reviewed mode-provenance change and set the private database checkout gate to Test mode. Retain the actual **838,860,800-byte** shared physical budget. Do not inflate it to imitate a paid storage plan.
4. Update Test webhook **140877** to **`https://woff.space/api/billing/webhook`**. Save the same signing secret in Vercel as `LEMON_SQUEEZY_WEBHOOK_SECRET`; keep it stable while issued checkouts remain payable.
5. Select all of these implemented events:

```text
subscription_created
subscription_updated
subscription_cancelled
subscription_resumed
subscription_expired
subscription_paused
subscription_unpaused
subscription_payment_success
subscription_payment_failed
subscription_payment_recovered
subscription_payment_refunded
```

The agent handles the hosted configuration, migration, deployment and verification. Store identity documents remain the owner's task when activation is possible; they are not a prerequisite for the already-working Test purchase. Local transport remains available for optional diagnostics and does not replace hosted verification. [Provider test mode](https://docs.lemonsqueezy.com/help/getting-started/test-mode), [webhook setup](https://docs.lemonsqueezy.com/guides/developer-guide/webhooks).

| Server environment variable | Value to supply |
| --- | --- |
| `LEMON_SQUEEZY_API_KEY` | Key created in the selected provider mode |
| `LEMON_SQUEEZY_STORE_ID` | Numeric store ID |
| `LEMON_SQUEEZY_VARIANT_ID` | Numeric ID of the $8 monthly variant in that mode |
| `LEMON_SQUEEZY_WEBHOOK_SECRET` | Signing secret shared with that mode's webhook |
| `LEMON_SQUEEZY_TEST_MODE` | `true` for this public no-charge release; `false` only for a separately authorized Live switch |
| `NEXT_PUBLIC_SITE_URL` | Exact origin of that app, used for return and receipt links |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Credentials for that app's database project |
| `SUPABASE_SERVICE_ROLE_KEY` | Matching server-only database credential; never prefix with `NEXT_PUBLIC_` |

Keep Test and Live provider credentials, variants and webhooks distinct. The server payment mode must match `woff_private.pilot_capacity.billing_test_mode`. Hosted Test records carry that mode so they cannot turn into Live Pro access after a later switch. Existing real rooms, files and accounts remain on the same backend, with normal authorization and the shared physical upload limit.

## 4. Run a real test purchase without paying

**Where:** [Woff checkout](https://woff.space/checkout), Lemon Squeezy Test checkout and webhook delivery history, after the new deployment is READY.

No terminal or local webhook receiver is needed for the hosted checkout. [Local checkout testing](local-checkout-testing.md) is an optional diagnostic guide; do not redirect the public Test webhook back to its temporary tunnel while hosted checkout is in use.

1. Sign in to a verified Woff account and open checkout from Woff. Release verification uses a new disposable account and preserves the owner's account and rooms.
2. Use provider test card **4242 4242 4242 4242**, a future expiry and any valid CVC. Never use a real card in Test mode.
3. Confirm that return to `/checkout/complete` shows Pro only after the signed webhook updates the account. A return URL alone must not activate Pro.
4. Check repeat checkout protection and hosted activation. **Manage billing currently reaches a provider portal blocked by store activation**; cancellation/refund verification can use guarded Test API calls for the exact disposable subscription. Do not claim the portal works before that restriction is removed.
5. Record the hosted provider result separately from earlier local/unit/database checks. No paid cloud staging or backup is required. [Test cards and behavior](https://docs.lemonsqueezy.com/help/getting-started/test-mode).

**Completed on October 9:** Test subscription **2593102** paid **USD $8** through the Woff-created checkout. Real signed notifications consumed its reservation and activated Pro; initial reconciliation returned 503, then actual provider retries succeeded. The return page showed Pro after the account update. Another checkout request returned `409 existing_subscription`. Provider cancellation stopped renewal while retaining Pro through **November 9, 2026 at 04:57 UTC**. A full Test invoice refund then switched the account to Free. Replaying the captured cancellation notification was ignored as a duplicate, and a signed synthetic older event was ignored as stale without changing access.

**Declined new purchase passed:** the provider's insufficient-funds Test card produced an explicit decline. That separate local account remained Free with no Pro deadline or reserved paid capacity; scoped provider checks found no customer or subscription for it. Its unconsumed checkout reservation expires at **October 9, 2026 at 05:43:27 UTC**. This does not test a recurring failed renewal or recovery.

**Coverage limits:** Manage billing reached Lemon Squeezy, which refused access because the store has not been activated. Cancellation was verified through the scoped Test-mode provider API instead. Completing the portal test requires the owner to activate the store and the provider to approve it; this does not block Free sharing. The ended-access result page was fixed and tested with a synthetic elapsed deadline; no actual month-long provider expiry or renewal has been observed. Local Auth is synthetic and the test capacity is a **2 GiB/two-seat SQL budget**, not evidence of hosted email delivery, Storage, Realtime, Cron or physical storage capacity.

## 5. Deferred until real sales: storage and hosting

Two existing constraints remain outside the payment integration:

| Current constraint | Practical route |
| --- | --- |
| Woff's configured storage budget is **800 MiB** while one Pro customer is promised **1 GiB** | Provision sufficient storage before enabling paid admission. A potential route without a fixed monthly storage charge is **Cloudflare R2 Standard**: 10 GB-month storage, 1 million Class A operations and 10 million Class B operations are included monthly; direct R2 egress is free. Usage beyond the included amounts is billed. This requires a separate implementation for private uploads, downloads, cleanup and capacity accounting; it is not a Supabase setting change. |
| The site currently runs on **Vercel Hobby**, which is for noncommercial personal use | Either choose a commercial Vercel plan or evaluate **Netlify Free**, which permits commercial projects and supports Next.js App Router, Server Actions and route handlers. Netlify Free pauses sites at its monthly credit limit. A migration must verify this app's auth, webhooks, uploads, headers and cleanup scheduling before moving the domain. |

These are researched options, not completed migrations or guarantees of unlimited free service. Keep Supabase Auth/database if only object storage changes. R2 uses usage-based billing and Cloudflare can require a valid payment method or preauthorize it; the owner must accept that billing arrangement. The agent has not purchased plans, connected a card, migrated storage or changed hosting. [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [Cloudflare billing policy](https://developers.cloudflare.com/billing/understand/billing-policy/), [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Netlify commercial use](https://www.netlify.com/blog/introducing-netlify-free-plan/), [current Netlify limits and pause behavior](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/billing-faq-for-credit-plans/), [Next.js support](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/).

## 6. Open live checkout after those checks pass

**Where:** Approved Lemon Squeezy Live mode; production hosting environment settings; Supabase SQL Editor for the private capacity row.

1. Copy the tested product to Live mode. Test products are not automatically live; confirm the live variant ID and USD monthly price.
2. Generate a **live API key** and a live webhook at **`https://woff.space/api/billing/webhook`**, selecting the same events above. Supply its signing secret securely.
3. In the production host's project environment settings, save the four Lemon Squeezy credentials/IDs and `LEMON_SQUEEZY_TEST_MODE=false`. On Vercel this is **woff → Settings → Environment Variables → Production**. Retain the existing correct Supabase credentials and `NEXT_PUBLIC_SITE_URL=https://woff.space`.
4. The agent verifies the live product, bank/merchant readiness, chosen commercial hosting and storage/cleanup evidence. It sets a conservative actual `capacity_bytes` in `woff_private.pilot_capacity`, retains at most five paid accounts, uses `billing_test_mode=false`, and opens `checkout_enabled` only after admission is supportable.
5. Finally enable `WOFF_BILLING_ENABLED=true` and `WOFF_STORAGE_CAPACITY_VERIFIED=true`. Existing account and email gates remain enabled. Redeploy and verify the hosted flow. An environment flag cannot create storage capacity or merchant approval.
6. Monitor the first genuine purchase and webhook delivery history. Lemon Squeezy retries failures only a limited number of times; investigate failures and replay after repair. Do not tell a payer they have Pro until Woff confirms the account state. [Webhook retries](https://docs.lemonsqueezy.com/help/webhooks/webhook-requests).

To pause new sales later, close both billing gates while keeping accounts, customer billing management and cleanup working. Refunding a payment does not automatically cancel future recurring charges; check and cancel the provider subscription as appropriate. Full technical behavior is documented in [account and billing activation](account-billing-setup.md).

The owner handles merchant identity, bank/tax information and any spending decision. The agent handles this authorized public Test deployment; the supplied credentials do not need to be sent again. Store activation remains necessary for the provider portal and eventual Live sales, and can stay pending during the no-charge release.

## Pause or switch later

To pause new checkout, set `WOFF_BILLING_ENABLED=false` and `woff_private.pilot_capacity.checkout_enabled=false`, then deploy the application configuration. Keep accounts, signed webhook reconciliation, existing billing records, downloads and cleanup working. Closing admission does not itself cancel an existing provider subscription.

Switch to Live only when the owner asks: pause admission first, resolve outstanding Test subscriptions/checkouts, supply distinct Live credentials, variant and webhook, set both server and database payment modes to false, and verify real capacity before reopening. Test-origin entitlements normalize to Free in Live mode; they never become paid subscriptions merely because the flag changes. Preserve the records for audit and do not delete rooms/files or repurpose Test subscription IDs. A Live checkout must establish its own verified ownership binding and storage commitment.
