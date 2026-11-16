# Instagram import latency and progress — November 16, 2026

Follow-up to [accuracy verification](instagram-import-accuracy.md) on
`test/post-refactor-release-validation`. Changes remain uncommitted.

## Changes

- Photo transcription runs at most two requests concurrently. Each image keeps its
  original index; the interpretation pass receives the same ordered transcripts
  and the same prompts/model as the accuracy fix. A failed image aborts sibling
  requests and rejects the whole extraction, never returning a partial carousel.
- Automatic location lookup runs at most two candidates concurrently, matching
  the existing two-worker server limit. Search and details for each candidate
  remain ordered. All candidates settle before the existing save flow begins.
  Confirmed candidates are retained on retry; cancelled work cannot publish late
  results. Place matching, geography checks and storage authorization are unchanged.
- Malformed/incomplete model JSON gets one bounded retry with usage accounting;
  a second malformed response still fails instead of accepting partial data.
- Bedrock allows one SDK retry for transient failures; the overall 95-second
  extraction deadline, image/byte limits, global worker leases and daily quotas
  remain in force. This does not raise the server worker limit.
- The authenticated job endpoint exposes actual OCR completion counts. Progress
  writes are serialized and owner-scoped, and completion/failure clears transient
  progress. The browser validates counts and guards against stale sessions.
- The existing blurred loading overlay now shows a concise stage label and a
  smaller muted count: Opening post, Reading photos, Identifying places, Finding
  locations, and Saving places. Counts represent completed work, not a timer or
  invented percentage. Other loading overlays retain their existing appearance.
- The job submission acknowledgement body is explicitly cancelled after HTTP 202;
  the actual result still comes through authenticated polling.

No shared extraction cache was introduced: this change avoids new cache privacy,
freshness and invalidation behavior. It does not promise lower per-import billing;
normal successful extraction still needs one model call per photo plus one
interpretation call, and progress adds bounded DynamoDB writes.

## Local verification

Lint, TypeScript and production build passed (existing MapLibre bundle warning).
162 unit tests, 79 Chromium browser tests (21 import, 42 cloud, 12 direct, four
processing), and 42 WebKit cloud tests passed. New checks cover parallel bounds,
out-of-order completion/source ordering, failure cancellation, owner-scoped
progress, desktop/mobile progress rendering and cancellation retaining the input.
Desktop/mobile screenshots were visually reviewed: no extra panels, badges,
stepper or decorative accents were introduced.

The standalone local preview endpoint still returns a single extraction response;
per-photo live counts are supported by the AWS job endpoint used by the configured
application. They are not simulated for a local endpoint that lacks progress.

## Live validation

The [JSON companion](instagram-import-performance.json) records the deployed NYC 13-photo/ten-place check, extraction
and end-to-end timings, source/coordinate assertions, cleanup and final pause.
Timings are individual provider runs, not a statistically controlled benchmark or
latency guarantee. The previous deployed sequential extraction took 60,608 ms
(the earlier local extraction run was 40,074 ms).

Before this run, the existing user had continued testing since the prior report:
22 persistent records, one account and 18 photos were present. The older fingerprint
baseline was archived locally, and this current state was captured read-only as
this run's preservation baseline. No existing records were reverted to the older
11-record baseline. Only new disposable test accounts are used for live validation.

Use the bounded test commands in the [accuracy report](instagram-import-accuracy.md)
to reproduce the focused check. Physical devices remain untested; engine emulation
is not equivalent to an actual iPhone or Android device. No commit or push.

Final deployed result (Amplify job 23, final backend packages): all ten NYC places
passed name/source/slide/geographic-bound checks and persisted after reload.
Extraction took **25,879 ms** (14 model calls); input submission through ten saved
places took **54,439 ms**. The previous deployed sequential extraction took
60,608 ms. This sample demonstrates reduced latency, not a universal time guarantee.
Actual polled photo counts included 0, 2, 5, 9 and 11 of 13 before the interpretation
stage; polling may skip intermediate counts rather than inventing them.

The first performance deployment failed with malformed model JSON and saved no
places; its temporary accounts were cleaned up. The final version adds a single
bounded format retry without relaxing source checks. The successful run used 14
model calls, so it did not need that retry. Temporary storage/photo/detail 429s
were observed; existing retries completed all ten saves. A background photo request
failed, so this check does not assert universal representative-photo availability.
No uncaught browser exceptions or cleanup errors were recorded.

Final read-only audit: all 22 existing records, one account and 18 photos are
unchanged, with no additional user data remaining. Hosting/map paused, API
disabled, storage/processing/worker concurrency zero, schedules disabled.
