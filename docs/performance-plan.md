# Woff performance plan

Prepared September 30, 2026; implementation updated October 1, 2026. The room and note-editor notice has been removed. The original plan below is retained for reference; implementation status, verification, measurements, and conditional decisions are recorded in [performance-implementation.md](performance-implementation.md).

The aim is to shorten real processing time and give immediate, accurate feedback while work completes. Preserve anonymous-session ownership, rate limits, expiry, upload cancellation, and note conflict detection.

1. **Establish a production baseline first.**

   Measure new visitors separately from returning visitors: anonymous session creation can affect the first operation. Capture click-to-ready for room creation, room joining, and note creation; download response time and download start; upload preparation, byte transfer, and publication; autosave acknowledgement; and ZIP preparation. Record median and p95 timings, request counts, transferred bytes, and browser memory. Use a phone and desktop, normal and throttled networks, and rooms with few and many entries. Keep private URLs and file or note content out of telemetry.

   Use small files, a 50 MB file, batches of 5 and 20 files, and several pasted note images. Separate network transfer time from application overhead. Set performance budgets after collecting this baseline; do not promise a fixed duration for large transfers.

2. **Start individual downloads through the browser immediately. Priority: highest.**

   `lib/download.ts` fetches the complete file into a Blob before triggering the browser download. `app/api/files/[...path]/route.ts` checks membership, looks up the asset, signs a URL, and then proxies the bytes through Next.js.

   Add a dedicated download mode with an attachment filename. Authorize the request and check room/file expiry, then evaluate redirecting to a short-lived signed Storage attachment URL so bytes go directly from Storage to the browser. Keep the existing preview behavior and Blob handling for local content and archive generation. Combine membership and asset lookups only where equivalent checks can be enforced.

   Cap signed access at both the configured short lifetime and the applicable room/file deadline. Test expired and deleted files, unauthorized requests, Unicode filenames, images and PDFs, and mobile browsers. Preserve Range/206 behavior for media or use direct delivery when it supplies that behavior. Success means the page stops buffering entire individual downloads and the browser download starts earlier; total transfer speed must be measured separately.

3. **Remove duplicate work when joining a room. Priority: high.**

   `validateRoomCode` already calls the join RPC, followed by a second authoritative `open_space` during navigation. Clipboard joining validates once before calling a handler that validates again. Consolidate joining to one authoritative open path, deduplicate in-flight requests, and remove unnecessary 100 ms waits. Retain clear invalid/expired feedback and attempt limits.

   Verify PIN entry, Enter, pasted links, clipboard joining, QR joining, repeated clicks, and expired codes. Compare both request counts and click-to-room-ready timing.

4. **Make room and note creation open useful content sooner. Priority: high.**

   Room and note creation are already atomic database RPCs. The remaining path is creation followed by navigation and another room/note snapshot request. Profile those stages before changing the architecture.

   Load the minimum room shell first. The composer eagerly imports `tus-js-client`; move that library behind upload intent and warm it when the user chooses files or starts a drag. The drawing component is dynamically imported but mounted even while closed; mount it when needed. Measure other modal and viewer chunks before deferring them. Preload the editor bundle on intentional note creation.

   If the second snapshot is a material delay, evaluate returning the initial room/note snapshot from the creation transaction and handing it to the same-session view. Revalidate in the background and reconcile missed realtime changes. Keep handoff data scoped to the user and room; never treat an unconfirmed optimistic room or note as successfully created. Do not create rooms merely because a button is hovered or prefetched.

5. **Reduce note-save latency and work on every keystroke. Priority: high.**

   `updateNote` currently performs rate limiting, a note lookup, a version-checked update, and an entry metadata update sequentially. Replace this with one transactional save RPC after server-side sanitization. Preserve creator ownership, expiry checks, size limits, the expected version, and explicit conflicts. Update entry metadata only when its visible fields change. Return a compact acknowledgement instead of echoing full HTML and JSON on every save.

   The editor also serializes HTML/JSON and writes localStorage on each edit. Debounce draft serialization and statistics, retain the last durable offline draft, and flush on explicit Save and navigation. Keep one save in flight and the latest pending edit instead of queueing every stale snapshot. Track a local edit revision: only show Saved or remove a recovery draft when the acknowledged revision matches the current edit. Preserve the current batching intent rather than simply reducing the one-second autosave debounce.

   Validate rapid typing, large notes, offline editing, reconnect, navigation during save, and two-tab version conflicts. Measure typing responsiveness and save acknowledgement separately.

6. **Improve upload preparation and multi-image handling. Priority: medium.**

   Preserve the main uploader's existing batched reservation, three concurrent resumable transfers, direct Storage hostname, and atomic publication. Benchmark a standard small-file path against TUS before adding a second transport; progress and retry behavior matter as well as setup time.

   For images pasted into notes, batch reservations and use a small concurrent queue. Preserve placeholder positions and deterministic insertion order. Calculate dimensions during transfer and avoid holding the next upload until the permanent preview has been fetched and decoded. Throttle progress updates to animation frames or changed percentages.

   Evaluate retaining completed uploads during an explicit batch retry so only failed files transfer again while reservations remain valid. Keep final publication atomic and clean up cancelled or abandoned work. Test mixed files, interruption, resume, retry, cancellation, and final publication failure.

7. **Make ZIP preparation consistent and responsive. Priority: medium.**

   Sidebar and image-viewer ZIP flows fetch files sequentially, while file-card ZIPs use unbounded parallel requests. Use one bounded queue, initially three workers, across these entry points. Add HTTP-status checks, progress, cancellation, and explicit partial-failure handling.

   Profile peak memory with large batches. A worker can keep archive generation off the UI thread but does not by itself solve memory use; evaluate streaming archives only if the measurements justify the additional design. Test duplicate filenames, missing files, large batches, and cancellation.

8. **Keep large rooms and infrastructure responsive. Priority: after the main flows.**

   Room snapshots currently return every active entry and render the full list. Add cursor pagination for older entries if large-room measurements show a problem. Use a stable timestamp-and-ID cursor, preserve the scroll anchor, and merge realtime changes by ID. Keep sidebar search and downloads able to access older items. Reconcile missed changes on reconnect before relying on snapshot reuse or paging.

   Check the actual application-function and database regions; align them if cross-region latency is material. Inspect query plans and indexes only for measured slow queries. Existing memoized cards, lazy sidebar/viewers, on-demand QR and export libraries, and request-scoped auth reuse are useful foundations.

Implement one group at a time and compare it against the production baseline. Start with downloads and duplicate room joins, then creation/loading and note saves, followed by image uploads, ZIPs, and large-room handling.

Primary documentation supporting the plan: [Supabase private downloads and signed URLs](https://supabase.com/docs/guides/storage/serving/downloads), [resumable uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads), [standard uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads), and [Next.js 15 lazy loading](https://nextjs.org/docs/15/app/guides/lazy-loading).
