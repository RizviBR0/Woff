# Woff income and product analysis

Prepared October 3, 2026. Business location: Bangladesh. Intended market: worldwide.

**Recommendation:** keep Woff's instant sharing free, and test a paid product for people who repeatedly deliver work to clients. The strongest initial audience is freelance web developers and designers, followed by small agencies. Charge the sender for project organization, controlled availability, presentation, and access management; keep the recipient experience simple and free.

This is a commercial hypothesis based on the product and competitors, not evidence that customers already want to pay. Actual traffic, operating bills, repeat use, and income target were not available. All proposed prices, quotas, and validation thresholds below are experiments.

The review covered the main application routes and journeys, room and note interfaces, image markup, upload/download utilities, server actions, anonymous authentication, Supabase migrations, storage cleanup, realtime architecture, public policies, SEO/blog content, and deployment/performance documentation. The live homepage was also read. Production database state, deployment parity, invoices, analytics dashboards, and payment-provider approval were not verified. No application code was changed.

**What the project already has going for it.**

Woff combines asynchronous file delivery with instructions, links, code snippets, rich notes, screenshots, drawings, and an activity timeline. That combination is more commercially interesting than a plain transfer link. A client can open one room and find both the deliverable and its explanation. Image markup already publishes an annotated image back into the room, which provides a starting point for visual feedback: [media-entry-card.tsx](E:/Woff/components/entries/media-entry-card.tsx:405).

The upload/editor engineering is useful groundwork: resumable transfers, progress, cancellation and retry, atomic publication, versioned note saves, conflict handling, and local draft recovery. Private Storage, membership-based access, RLS, ownership checks, and queued deletion also provide foundations to extend. The product should not need a broad redesign before testing demand.

However, owner-editable notes and a live room timeline do not currently amount to shared document coediting or a complete client approval system. Those would be new features. Extension build scripts and extension-related migrations exist, but the referenced `extension/` source directory is absent from this checkout; an extension cannot be counted as a verified shipped acquisition channel.

**Who is most likely to pay.**

| Audience | Job Woff could do | Commercial priority |
| --- | --- | --- |
| Freelance web developers and designers | Deliver a website handoff, design package, or PDF with instructions; collect missing client assets | First audience to test: recurring work, a clear sender, and a recipient who benefits from simple access |
| Small agencies | Reuse branded delivery templates and manage multiple clients and senders | Expansion after individual paid use is demonstrated |
| Small developer/support teams | Share bug reproductions, screenshots, snippets, and troubleshooting instructions | Second experiment if actual usage points here |
| Students and casual cross-device users | Move notes, text, and small files quickly | Useful free acquisition; recurring willingness to pay is uncertain |
| Professional video delivery or regulated enterprises | Large transfers, strict access/compliance requirements | Poor initial fit for the current limits and product scope |

Suggested positioning to test: **“Deliver project files and instructions in one link. Your client doesn't need an account.”** A second test is **“Collect client files without making them sign up.”** Keep the general free utility available while adding a focused client-delivery landing page.

**What competition tells us.**

Free alternatives make generic device transfer a difficult subscription proposition. [PairDrop's official project](https://github.com/schlagmichdoch/PairDrop) already offers browser file/text sharing, QR codes, and temporary rooms. [LocalSend](https://localsend.org/) offers free, account-free local transfers. Woff's more promising distinction is asynchronous delivery containing both files and richer context.

[WeTransfer's plan documentation](https://wetransfer.com/help-center/subscriptions/plan-limits) shows that paid plans sell custom expiry, passwords, branding, and access controls. These are established paid categories, rather than unique Woff inventions. Its [file-request example](https://wetransfer.com/resources/request-files/code-files) says contributors need a free account. A properly restricted Woff guest-upload workflow would therefore be a specific difference worth testing. It would need upload-only access so contributors cannot browse everyone else's submissions.

Do not compete by offering the most free gigabytes. Start with website assets, screenshots, PDFs, and technical handoffs, where combining instructions and deliverables can matter more than raw transfer size.

**The project-specific gaps that stand between Woff and revenue.**

| Finding in the checkout | Why it matters | Evidence and recommended action |
| --- | --- | --- |
| Pro exists as an admin-managed room flag | There is no functioning purchase, renewal, cancellation, or customer recovery system | [getPlanStatus](E:/Woff/lib/actions.ts:875) checks for any owned Pro room; the [database guard](E:/Woff/supabase/migrations/202607230001_secure_anonymous_platform.sql:874) restricts Pro changes. Add durable customer/purchase/subscription entitlements and provider webhooks. |
| Latest upload rules lack cumulative room quotas | A per-file cap does not bound the storage or bandwidth bill | [Latest batch reservation](E:/Woff/supabase/migrations/20260723180701_set_file_upload_limit_to_50mb.sql:63) caps 20 files and 50 MiB each, but omits the aggregate checks in [the earlier migration](E:/Woff/supabase/migrations/20260723132425_reserve_upload_batch.sql:34). Restore atomic room/owner quota accounting, including reserved uploads. |
| Identity is tied to an anonymous browser session | Paying users need to regain purchases and rooms after switching devices or clearing cookies | [Anonymous identity](E:/Woff/lib/supabase.ts:58). Offer optional sender accounts and preserve current ownership when upgrading an anonymous identity. |
| Recovery moves room ownership without transferring all content authorship | A recovered owner may still be unable to edit their old notes | [recover_space](E:/Woff/supabase/migrations/202607230001_secure_anonymous_platform.sql:596) changes the room creator; [note saves](E:/Woff/supabase/migrations/20260930174941_transactional_note_save.sql:27) check the note's author. Define and verify account-linking/merge behavior. |
| The four-digit code is both the public address and joining credential | There are only 10,000 possible codes, and permanently active rooms occupy this finite pool | [Code generation](E:/Woff/supabase/migrations/202607230001_secure_anonymous_platform.sql:393). Add stable random room links; make short codes temporary pairing conveniences. Correct [privacy wording](E:/Woff/components/bento-grid.tsx:7) that implies codes only reach intended people. |
| Passcode copy promises more than the recipient flow implements | Password-protected sharing is not ready to be sold | [Recipient guard](E:/Woff/components/note-editor.tsx:1260), [owner-only verification](E:/Woff/lib/actions.ts:827), and [passcode promise](E:/Woff/components/note-editor.tsx:2314). Either label locks as author-only or implement recipient unlocking with server-enforced access. |
| No multi-room sender dashboard | Repeated work is hard to manage and paid value is hard to recover | [Local recovery state](E:/Woff/lib/space-recovery.ts:5) remembers individual keys and recent codes. Add named rooms, search, expiry/usage display, and account-linked ownership. |
| Free rooms can remain active through edits | Longer retention alone may not sustain subscriptions | [Retention rules](E:/Woff/lib/sharing-copy.ts:4) reset the inactivity window after content changes. Combine predictable retention with organization, access controls, and presentation. |
| Public traffic measurement does not measure completed sharing | Pageviews cannot establish willingness to pay or cost per successful delivery | [Analytics gate](E:/Woff/components/privacy-safe-analytics.tsx:7) omits content routes; no business conversion-event pipeline was found. Add minimal first-party aggregate events. |
| Some acquisition pages reuse the homepage unchanged | Metadata targets a use case without demonstrating its specific workflow | [Code-sharing route](E:/Woff/app/share-code-snippets-online/page.tsx:14), [device-sharing route](E:/Woff/app/share-text-between-devices/page.tsx:14). Build distinct examples, useful instructions, and matching actions. |
| Marketing contains unsupported statistics and conflicting promises | Buyers need accurate expectations | [Hardcoded metrics](E:/Woff/components/bento-grid.tsx:94), [100%-free FAQ](E:/Woff/components/online-notepad-client.tsx:37), [subscription criticism](E:/Woff/app/about/page.tsx:52). Use verified numbers and explain free basic sharing plus optional professional tools. |

These are commercial-readiness findings, not a complete penetration test. The latest local SQL definitions may differ from the deployed database and should be checked before implementation.

**A small paid offering to test.**

Start with Free and Pro. Treat Teams and room passes as subsequent experiments, rather than launching four billing products at once.

| Offer | Proposed price | Proposed initial allowance and value |
| --- | --- | --- |
| Free | $0 | Preserve anonymous sharing, existing 50 MiB/file cap and 48-hour inactivity rule; test a 200 MiB room cap with a service-wide cost budget |
| Pro sender | $8/month; test $72/year later | Account-linked room dashboard, named project rooms, logo/welcome instructions, reusable handoff template, read-only delivery mode, revocable access, configurable 7/30-day availability; test 500 MiB/file, 5 GiB stored, and 20 GB monthly outbound transfer |
| Teams, later | $24/month to test | Three sender seats, shared room ownership and templates; example 20 GiB storage and 60 GB monthly outbound transfer, subject to usage economics |
| One-room pass, later | $5 for a bounded seven-day delivery | An occasional sender alternative with explicit bytes/transfer allowance and recoverable purchase; no recurring fee |

The caps are starting assumptions, not promises. Larger paid uploads require coordinated server-action, SQL constraint/RPC, bucket, and UI changes; changing the uploader alone is insufficient. The free cap needs clear messaging and evaluation against legitimate existing use.

Long random invitations should be part of the access foundation for everyone, with optional additional controls for professional rooms. A paid retention period must be shown clearly before purchase and sharing. Preserve special extension-upload expiry unless intentionally changing it; current copy says those files expire 48 hours after upload even in Pro rooms.

Do not sell unlimited transfers, lifetime storage, or automatic recovery of already deleted content. Cancellation should provide an explained download/grace period and a clear new retention deadline. Existing admin Pro rooms need an explicit transition policy.

**Feature order that connects work to payment.**

1. **Before growth:** repair quota accounting, clarify code/passcode/privacy claims, check cleanup health, and establish storage/download cost measurement. Add longer random invitations and basic reliable access controls.
2. **First paid bundle:** optional sender identity, saved-room dashboard, controlled retention, read-only delivery, revocation, branded welcome instructions, and one reusable project-handoff template. Keep recipients free and able to open the room without signup.
3. **Billing foundation:** hosted checkout, durable plan/purchase records, signed idempotent webhooks, a customer billing portal, failure/cancellation handling, and server-enforced entitlements. Add upgrade prompts beside saving a room, selecting longer availability, or encountering a limit.
4. **After repeated paid use:** upload-only file requests, structured feedback attached to an image/file, resolved status, and explicit recipient acknowledgement. Build file requests before Teams if interviews show collection is the repeated pain.
5. **After account/usage evidence:** team ownership, custom domains, integrations/API, or extension convenience. Prioritize whichever paying customers actually request.

A download redirect can establish that someone requested a download, not that the transfer completed or a person read/approved the work. Label receipts accurately. Recipient acknowledgement is a separate action; identity assurance is another separate product choice.

The first paid bundle and billing foundation must ship together before selling subscriptions. Their separate steps describe implementation work, not permission to charge before checkout, ownership, entitlements, and the promised features work end to end.

Avoid adding an AI assistant, marketplace, payment-gated sale of users' files, full document coediting, or a large enterprise feature set to the first commercial release. Each adds implementation or operating scope without first demonstrating demand for the core paid workflow.

**Worldwide payments from Bangladesh.**

Evaluate **Lemon Squeezy first** because its [supported-country documentation](https://docs.lemonsqueezy.com/help/getting-started/supported-countries) explicitly includes Bangladesh for bank payouts. Its [product policy](https://docs.lemonsqueezy.com/help/getting-started/prohibited-products) permits software/SaaS, but store and product approval are still required. Sell access to Woff's own software, rather than a marketplace for other people's goods.

**Paddle is an alternative to evaluate.** Its [supplier country policy](https://www.paddle.com/help/start/intro-to-paddle/which-countries-are-supported-by-paddle) supports software businesses outside its exclusion list, which currently does not include Bangladesh. This is country-level eligibility, not an approval of Woff or confirmation of a particular payout arrangement.

Do not start with a direct Bangladesh Stripe integration: Bangladesh is absent from [Stripe's supported business-country list](https://stripe.com/global). A supported merchant-of-record provider can simplify worldwide checkout and transaction sales-tax handling. It does not replace the owner's domestic business/income obligations. Worldwide selling still has provider country restrictions.

Verify onboarding and the intended bank payout method before investing in one provider's integration. No accounts were opened or applications submitted during this review.

Fees influence pricing. [Lemon Squeezy's fee documentation](https://docs.lemonsqueezy.com/help/getting-started/fees) shows a 5% + $0.50 base, an additional 0.5% for subscriptions and 1.5% for international transactions, plus a 1% bank-payout fee outside the US. It calculates transaction fees on total order value, including added tax. [Paddle's pricing](https://www.paddle.com/pricing) advertises 5% + $0.50 per transaction. Small $1 purchases lose a large share to fixed fees; annual plans or useful room bundles are more sensible experiments.

**Revenue examples, with the assumptions visible.**

The following assumes $8 monthly subscribers, illustrative 7% + $0.50 transaction fees and 1% payout fees, no tax added to the modeled transaction, and $45/month in base hosting/database costs. This is a simplified international-card subscription example, not a quote for every customer or a profit forecast.

| Paying subscribers | Gross monthly subscription revenue | After illustrative payment/payout fees | After fees and $45 base costs |
| --- | ---: | ---: | ---: |
| 20 | $160 | $137 | $92 |
| 50 | $400 | $344 | $299 |
| 100 | $800 | $687 | $642 |
| 250 | $2,000 | $1,718 | $1,673 |

The last column still excludes additional bandwidth/storage/compute, free-user usage, domains, email, monitoring, refunds, marketing, support, owner labor, and tax. It is contribution before those costs, not take-home income. At $8, 125 paying accounts produce $1,000 gross monthly revenue; traffic required to obtain and keep those accounts is unknown.

The $45 baseline combines a single [Vercel Pro](https://vercel.com/pricing) account at $20/month and [Supabase Pro](https://supabase.com/pricing) from $25/month. Vercel's Hobby plan is for non-commercial personal use. Supabase Pro includes 100 GB file storage and 250 GB uncached egress, with listed excess rates of $0.0213/GB storage and $0.09/GB egress. This baseline is conditional on the actual configuration and included allowances.

For example, 100 customers using the proposed 20 GB outbound allowance consume 2,000 GB/month. If all of this is uncached Supabase egress, with the entire included allowance available to them, excess delivery alone is about $157.50/month. If they also retain about 500 GB total, excess storage is approximately $8.52/month. The $642 contribution above then falls to roughly $476 before the other omitted costs. Free users and previews can reduce it further. File previews currently stream through [the application route](E:/Woff/app/api/files/[...path]/route.ts:70), so actual hosting and storage delivery both need measurement; ordinary downloads already redirect to Storage.

Measure both normal and heavy users. Expiry limits storage duration, but does not prevent repeated downloads or high transfer costs while files remain available. Include pending uploads in quota reservations, release quota on cancellation/deletion, and enforce upload-only guest usage against the paying owner's allowance. A local anonymous-user quota is not sufficient protection against new-session abuse.

**Other income options and where they fit.**

| Model | Recommendation |
| --- | --- |
| Sender subscriptions | Primary experiment; recurring workflow and recoverable ownership are the reason to pay |
| One-time room passes | Secondary if people like Woff but use it occasionally; allow for fixed processing fees and bounded transfer costs |
| Agency setup/customization service | Possible earlier project income from a few customers asking for branded deployments or tailored handoff templates; price separately for setup and support, and record it as service revenue |
| Sponsorship | A limited public-page sponsor can help after an audience exists; suitability and saleability need evidence |
| Display ads | Low priority; require traffic and may conflict with the [current privacy promise](E:/Woff/app/privacy/page.tsx:86). Keep any experiment on public informational pages and make policies match behavior |
| Donations | Supplementary and unpredictable; use a provider that supports the payout country and donation use case |
| Paid API/integrations | Later, when external workflow demand is demonstrated; requires durable credentials, quotas, reliability, and support |
| Affiliate content | Later, with useful original comparisons and disclosed relationships; no evidence this checkout currently attracts sufficient purchasing traffic |

For illustration only, an assumed $3 page RPM would produce $300 from 100,000 monetized pageviews. That RPM is an arithmetic assumption, not a claim about Woff's likely ad rates. Storage usage can grow even when monetizable public-page traffic does not. Advertising therefore cannot substitute for usage economics.

**How to find the first paying users.**

Use a planning sequence, not a guaranteed delivery schedule:

- **First two weeks:** obtain real usage and bill data; interview about 15 freelancers who recently delivered client work; observe five real handoffs; validate provider onboarding; fix the cost/trust issues. Ask about their last delivery, lost instructions, missing assets, and current paid tools instead of asking whether they like Woff.
- **Following two to four weeks:** demonstrate a concrete paid pilot and build the smallest bundle that participants value. Test roughly $8/month against a bounded room purchase. A useful early decision threshold is three paying users from ten qualified pilot invitations, followed by repeat use; this is an experiment target, not an industry benchmark.
- **Following month:** recruit more users in the same audience, review retention and cost per account, and improve the one feature associated with repeat use. Introduce annual billing or Teams only if the underlying paid experience is reliable and demand supports it.

Start through personal introductions and freelancer/design/developer communities where outreach is permitted. Offer to observe a real delivery and provide a useful handoff template. No outreach messages were sent as part of this review. Avoid paid acquisition until repeat usage, conversion, and gross margin are understood.

Create a distinct project-handoff page with an actual demo. Test client asset collection through a clearly labeled prototype or waitlist until upload-only access exists; if interviews make collection the chosen first audience, move that restricted workflow into the pilot bundle. Existing utility pages can bring free users; route relevant visitors to a useful template rather than a generic homepage. The current [blog action](E:/Woff/components/blog-article-content.tsx:228) sends users home. Content ideas include a website handoff checklist, a logo-package delivery checklist, and an asset-request template. Describe capabilities truthfully and avoid presenting planned features as available.

After a recipient successfully uses a room, show a restrained action to create their own. This creates a recipient-to-sender discovery loop without forcing recipients to purchase. Seek useful partner/tutorial exposure after real users can demonstrate the workflow.

**What to measure to decide whether the strategy works.**

Track the sequence: visitor → room created → first content published → distinct recipient joins → file/view request or explicit acknowledgement → owner returns for another delivery → paid purchase → paid owner remains active. Separate senders from recipients and acquisition traffic from actual deliveries.

Keep content, note titles, filenames, room URLs, codes, and recovery secrets out of business telemetry. Use short-lived or appropriately protected internal identifiers, coarse event properties, and aggregate reports. Verify what loaded public-page analytics does during navigation before claiming content routes are completely untracked.

Every month review repeat senders, successful guest access, expiry confusion, purchase conversion among qualified senders, cancellations and reasons, refunds, support time, storage/egress per cohort, and cleanup backlog. Count the economics of free users too. Only forecast future revenue after observing these inputs.

**Decision:** test a narrow paid client-delivery workflow while preserving the free utility. The next implementation should establish usage controls and durable sender ownership, then deliver a small recoverable paid bundle. More decorative UI, more generic blog posts, or a larger feature list will not answer whether customers will pay.
