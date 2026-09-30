# Performance implementation

Updated October 1, 2026.

The room and note-editor warning has been removed. Marketing and help pages still explain temporary sharing. Application changes are local and ready to deploy; `save_note_snapshot` has already been applied to WoffNote Share in Rizvi's organization.

## Implemented

| Flow | Change |
| --- | --- |
| Downloads | Private attachment requests authorize membership and asset access, check room and entry expiry, and redirect to a Storage URL valid for at most 60 seconds and no longer than the applicable deadline. Individual files no longer accumulate in a page Blob. Preview requests retain streaming, Range, and 206 headers. Filename query parameters are encoded once, including Unicode. |
| Joining | PIN, Enter, paste, clipboard, and QR use the same guarded navigation path. The destination performs the authoritative `open_space` call; duplicate validation, prefetch, and join delays are removed. Invalid/expired joins return home with feedback. |
| Creation | A synchronous ref prevents duplicate room creation. TUS loads on file intent, drawing code mounts only when opened, and note creation warms the editor module. No unconfirmed room or note is shown as successfully created. |
| Note saves | One transactional RPC checks owner, room/file expiry, content size, expected version, and rate limit. The server action sanitizes HTML. A save returns only version and timestamp; content-only saves skip the room-entry metadata update. |
| Editor work | Draft/statistics serialization debounces for 300ms, autosave remains 1 second, and saves retain one in-flight snapshot plus the latest pending revision. Only the current revision's acknowledgement clears its draft. Explicit Save, navigation, hiding, and unload flush drafts. Local storage failures do not block server saving. |
| Uploads | Three resumable transfers and atomic publication remain. Image dimensions overlap transfer. Progress updates only when the percentage changes. Valid completed reservations survive retry; publication retry does not re-upload completed files. Cancellation rejects pending transfer promises and isolates the cancelled batch. |
| Note images | One batched reservation, three concurrent transfers, and concurrent dimension reads. Ready images insert as one ordered transaction at the mapped placeholder location. Failed images retain retry controls and completed companions are reused. Permanent image decoding does not hold the transfer queue. |
| ZIPs | File cards, sidebar, and image viewer share three bounded fetch workers, HTTP error checks, cancellation, progress, and duplicate filename suffixes. Missing files or notes fail explicitly rather than silently producing partial archives. |
| Realtime | Reconnection reads the authorized snapshot and replays events received during that read. Pending local entries survive reconciliation. A realtime insert no longer replaces an unrelated pending upload. |
| Infrastructure | The current Vercel deployment reports `iad1`; WoffNote Share is in `ap-southeast-1`. `vercel.json` now selects `sin1` for subsequent deployments. This has not changed the currently deployed frontend. |

## Evidence and limits

The original production build loaded 326 kB of initial room JavaScript. The changed production build loads 313 kB. The note route is approximately 350 kB; editor code warms during the user's confirmed creation request.

After integrating GitHub commit `7f04b7c` (Markdown editing and file-to-note opening), the merged build loads approximately 314 kB for the room and 369 kB for the note route. Both editing modes use transactional saves, revision tracking, debounced drafts, and offline recovery. The removed sharing warning stays removed. `scripts/merge-note-check.mjs` verifies Markdown title/content saves, delayed acknowledgements, offline drafts, downloads, switching modes, empty notes, and opening uploaded Markdown files.

[performance-baseline.json](performance-baseline.json) records one pre-change cold creation sample: room 4,061ms, note 897ms. [performance-results.json](performance-results.json) records the desktop production check; [performance-results-mobile-throttled.json](performance-results-mobile-throttled.json) records the mobile/throttled check. These are smoke measurements, not a statistically reliable before/after study or a production p95 guarantee. Anonymous authentication, connection warming, and network variability affect timings. Upload throughput is separate from application overhead; a 50 MiB transfer was exercised successfully.

Metrics store operation names, durations, request counts, and optional aggregate long-task/JS-heap readings. They exclude room codes, URLs, tokens, and user content. Heap readings exclude native Blob/ArrayBuffer storage and are not total browser peak memory. Mobile checks emulate a touch viewport in Edge; throttled checks use 1Mbps, 150ms latency, and 4x CPU, not a physical phone.

Build, TypeScript, lint, four bounded queue/error/cancellation tests, and real database save checks pass. Browser checks exercise ownership-dependent creation, saves, offline recovery, conflicting tabs with explicit production-safe feedback, delayed acknowledgements, image ordering, multi-file upload, ZIP preparation, Unicode filenames, Range responses, unauthorized/expired reads, upload cancellation/publication retry, missed realtime messages, and retry after an expired room. Fixtures created by the full check are cleaned up by their captured room IDs; it never deletes arbitrary user rooms.

## Conditional decisions

- Keep TUS for the main uploader: the small-file and 50 MiB flows work, and adding another transport would need a controlled setup/throughput comparison. Standard uploads remain for inline note images.
- Keep authoritative creation snapshots: no session handoff cache is introduced based on a single latency sample.
- Do not introduce cursor paging yet: the inspected live rooms had at most three entries. Paging requires maintaining older-item search/download access and scroll anchors; it is conditional on a measured large-room problem.
- Keep on-demand JSZip generation: the tested 20-file archive did not justify a compression worker. Very large archive memory and streaming need a separate stress measurement; the current archive still holds its inputs in memory.
- A post-deployment sample is required to quantify the region change, along with repeated cold/warm runs before claiming median/p95 improvements.

## Reproduce

Use the configured Woff `.env.local` and a production server on port 3001:

```powershell
npm run build
npm run start -- --port 3001
```

In a second terminal:

```powershell
node --test scripts/performance.test.mjs
node scripts/note-save-check.mjs
node scripts/merge-note-check.mjs
node scripts/performance-browser.mjs --large
node scripts/performance-browser.mjs --mobile --throttled
```

Node 26 and installed Microsoft Edge were used here. `note-save-check` and the browser check require the service-role key only for verifying and cleaning their own fixtures. Test code never publishes credentials to the browser. Do not rebuild `.next` while a production benchmark is running; restart the server after a new build.
