# Post-refactor release validation — November 16, 2026

**Follow-up:** [Instagram import accuracy](instagram-import-accuracy.md) supersedes the NYC failure described below. This report preserves the earlier baseline.

Branch: `test/post-refactor-release-validation`. Base commit: `49d1244565f64a2f567b295ca9d120687fdfbb73`.
Validation includes the uncommitted fixes on this branch. The previous reports remain historical and unchanged.

## Scope and data protection

The audit baseline contains 11 persistent records, one existing account and nine photos. A new private fingerprint baseline was recorded before deployment; the previous baseline was archived locally. Tests use two newly created suppressed-email accounts. No existing account is used for sign-in, password reset or mutations.

Actual email signup/reset delivery passed in the November 12 release. It is reused as historical evidence; no new verification email was requested in this run. Account/session UI, token refresh and simulated seven-day expiry are covered by local fixtures; this is not a seven-day wall-clock observation.

## Corrections

### Supported Instagram input

The shared URL parser previously advertised Reel links even though extraction only supports photo carousels. Reel input now fails locally with a clear message and preserves the URL. Both backend and local API preserve HTTP 422 for unsupported media; invalid syntax remains HTTP 400. Regression checks verify no provider request/worker invocation occurs for rejected Reels.

### WebKit collection menu

WebKit reproduced a real interaction defect: clicking a portal menu action blurred its focused item before click delivery, causing the row's blur handler to unmount the menu. Rename/delete, journey creation and sharing actions could therefore disappear without opening their dialogs. Preventing the primary mouse-down default within the menu preserves focus until the existing action handles the click. Keyboard navigation, Escape and focus return remain covered. No CSS, layout or design assets changed.

The original WebKit run exposed this defect and was stopped after failures; it is not counted as passing evidence. After the fix, all 42 cloud-workflow WebKit tests passed, including the failed collection/journey/sharing paths.

### Verification tooling and CI

- Added a WebKit configuration and `npm run test:webkit-ui`.
- Added a bounded fixture-only CI browser job for Chromium direct/cloud workflows and WebKit cloud workflows. No AWS credentials are required. CI itself has not run because this branch is not pushed.
- Replaced hardcoded historical fix flags in the artifact auditor with actual working-tree status.
- Added optional, bounded extra import-sample checks to the live validator. They use its disposable second account and cleanup path. Source candidates and provider details are saved without tokens; provider matches still require independent source review.

### Oversized public carousel

The supplied NYC photo post failed with `post_too_large`: thirteen originals totaled 27.81 MB, exceeding the existing 20 MB analysis budget. These were 4K images despite readable full-slide 1080×1350 provider variants being available. The extractor now reads JPEG/PNG dimensions without decoding a large bitmap and tries at most three provider-supplied alternatives for oversized images. It accepts only smaller variants with a short edge of at least 1000 pixels, long edge at most 2048 and matching aspect ratio. It never rewrites signed URLs or crops slides; failed/unsuitable alternatives retain the original and existing limits.

The same thirteen full slides totaled 2,380,618 bytes after selection. This measures model-input size, not total download traffic: checking the original still downloads it. Existing host, response-size, aggregate-size and timeout safeguards remain. Four unit tests cover dimensions, truncated headers, variant size/aspect constraints, fallback and cancellation. Explicit oversized-photo messages now preserve the input instead of falling back to a generic error.

### Source context and extraction quality

A real NYC import initially extracted an incidental `AMBASSADOR` sign without a region and matched a hotel in Brazil. The sample validator did not save that result. Automatic imports now stop before search when neither a source city nor a printed address is available; the user can use direct place search instead. The regression checks that retry also makes no search/details request and no add action becomes available.

Multi-image model requests also skipped small author captions and combined distinct venues. Extraction now analyzes one slide per request, reads the full author-added caption before selecting names, carries explicitly supplied city context, splits distinct names and distinguishes background signs, show/song titles and generic activities. It does not add sample-specific place mappings. The overall 95-second deadline, photo-count limit and byte limits remain. More model requests can increase latency/cost; this is an accuracy trade-off, not a speed claim. Prompt changes are not proof of universal correctness; each live result below is reviewed separately.

Automatic name matching also rejected neither a museum's cafe nor a nearby road in the initial NYC check. It now rejects unrelated added words/tenants and non-POI results unless the request explicitly names a street. Street abbreviations, geographic suffixes such as State Beach, and transit operator prefixes remain supported. A single-word abbreviation without a printed address requires direct search instead of automatically accepting a namesake business. Regression cases cover the reproduced bridge/street, museum/cafe and abbreviated-museum/bar errors. This favors an unresolved result over a wrong saved pin; it does not establish universal provider coverage.

## Local verification

- Lint, TypeScript, production build and 148 unit tests passed.
- Chromium: preview 25 passes / three intentional platform skips; import 18; cloud 42; map 9; direct 12; processing 3. Total: 109 passes.
- WebKit: 42 cloud-workflow, 12 direct-search and nine map passes (63 total).
- The existing large MapLibre chunk warning remains. Main entry remains approximately 351 kB; this run does not establish new network latency benchmarks.
- Known first-run harness issues (temporary WebKit config server working directory and overlapping local server port) were corrected before completed runs. They were not treated as product failures or passing tests.

Cross-account state, network/503 recovery, throttling, duplicate writes, cancellation, private links, sharing revocation and provisional journeys are covered by existing fixtures. Journey unit tests cover closed weekdays, overnight hours, daylight saving, long visits, unreachable routes, extended dates and one-time inclusion of each selection.

## Real deployment and samples

The final matching safeguards are deployed in Amplify job 21. All 13 JavaScript/CSS assets and four Lambda artifacts were compared with the local deployment artifacts. CSS hashes match the first test deployment; no CSS, design assets or layout changes were made. These are uncommitted branch changes, not a claim that the base commit alone contains the fixes.

The live walkthrough uses dedicated test accounts for sign-in/out, LA import, cross-account isolation, persistence, photos, notes/visited state, collection colors, all-stop journey save/edit/share/revoke/delete, public collection privacy/revocation, direct CSUSM search and collection CRUD, and private-link authentication. All 14 final core checks passed; cleanup reported no errors. The JSON companion records each result. This core-flow pass does not mean the extra sample accuracy passed.

| Sample | Evidence and limitation |
| --- | --- |
| Existing LA 12-photo sample | Ten English locations resolve and save. All nine unvisited selections appear in the saved journey; unknown hours remain explicitly labeled. |
| `DfLAnjLEx2G` | Mixed video/photo carousel is rejected with the supported-media message. A selected `img_index` does not restrict analysis to that one photo. Video analysis remains out of scope. |
| `DSuNUlDERWj` | Initial run extracted nine candidates from twelve photos. No Korean coordinates were saved; detailed South Korean lookup remains unsupported. This extraction was before the final prompt revision, not a fresh final-version pass. |
| `DZ9PJzuj1h5` | Thirteen photos now fit the analysis budget. Accuracy remains partial: activities can become false candidates, short names can fail English conversion, and the provider may return districts, nearby roads or tenants. See successive sample runs and the independent slide review; this is **not** an all-places success. |

A separate two-query provider inspection confirmed `Central Park, New York` is returned as **District**, which the current selectable-place contract excludes. `Guggenheim Museum, New York` returned **Guggenheim Museum Cafe**, not the museum. Do not label these as successful attraction matches or claim that a coordinate proves the intended venue. Supporting regional places requires a deliberate type/selection/storage review; arbitrary type acceptance or a sample-specific substitution was not added.

The final NYC run extracted twelve candidates: nine correspond to explicitly named source places, while three are activity/incidental text. Only The Metropolitan Museum of Art resolved to a source-consistent venue after the safeguards; the other eleven remained unresolved. The extra sample accuracy check is **incomplete**, not passed. The NYC validation does not save candidate results. The earlier Brazil hotel, nearby bridge road and museum cafe/namesake matches are retained as failure evidence and covered by the new rejection tests. Model prompts remain probabilistic: a targeted local check excluding incidental signs did not prove every subsequent model call would do so. Remaining activity false positives and regional-place support are follow-up work, not completed accuracy checks.

Network evidence includes transient HTTP 429 responses and accepted HTTP 202 job requests whose unused response bodies appeared as `ERR_ABORTED`. A third-run GET had `ERR_FAILED` without a response and recovered through the existing retry; its underlying transport cause is not established. User-visible flows completed without duplicate saves or uncaught page errors. This does not assert that future network failures cannot occur.

Physical-device behavior, exhaustive branch discrimination and the unfamiliar NYC sample's end-to-end accuracy remain incomplete. Email delivery/reset reuses the dated earlier evidence. Current issue checkboxes distinguish these gaps from completed checks.

## Operational review

Read-only inspection found the deployed map key expires January 1, 2027. No renewal is needed for a December demonstration, but it must be renewed before that date for continued use.

DynamoDB reports point-in-time recovery **disabled**. Resource retention does not provide point-in-time recovery. Enabling paid backups and demonstrating restoration to a separate table remains a deliberate follow-up; existing data and backup settings were not changed.

Cost Explorer was read for November 1–16 (exclusive end November 17). Its estimated account-wide `Usage` record total was about USD 4.012; the all-record total was approximately zero after offsets/rounding. This is not a PinWish-only charge, final invoice, remaining-credit calculation or guarantee that this run is free. AWS Glue appears in the account total; it is not attributed to PinWish. Billing data can lag the current run. Existing request limits and bounded pause controls were retained.

Physical iPhone Safari and Android Chrome were not available to this agent. WebKit and mobile viewport checks are recorded as engine/emulation coverage, not physical-device passes. No real-device result is claimed.

## Final cleanup and follow-up

At 2026-11-16 19:11 UTC, the final private fingerprint comparison found all eleven existing persistent records, the one existing account and nine existing photos unchanged; no additional test records/accounts/photos remained. Temporary test accounts, their partitions, shares and photos were removed. Deployment artifacts remain available for rollback. Global quota counters and temporary service caches are not included in the persistent-user-data fingerprint.

Final `cloud:status` confirmed hosted app and map paused, API disabled, storage/processing/worker reserved concurrency all zero, and cleanup/auto-pause schedules disabled after cleanup. Pausing does not delete stored data or guarantee zero residual storage charges. No commit or push was made. Local Markdown targets and referenced npm script names in the edited guides were checked successfully.

The next accuracy work should address author-text versus activity/sign extraction, conversion using full source context, safe regional-place support, and provider-result specificity. Until that work passes unfamiliar source review, do not describe arbitrary Instagram imports as fully reliable. Physical mobile-device checks and backup/restore planning remain separate follow-ups.

## Final pre-commit verification — November 16

After the accuracy, performance, collection-recovery and transport follow-ups,
`npm run check` and 162 unit tests passed again. Fresh browser results: 21 import,
six processing, 43 Chromium cloud and 43 WebKit cloud tests passed. The 12 direct
search tests also passed earlier in this branch; they are not counted as a new
run in this final check. Git whitespace validation passed.

This final check used local fixtures and did not consume a user's import quota
or start an AWS session. The original localhost connection failure was not
conclusively reproduced; recovery tests are documented separately. Physical
mobile devices and exhaustive business-branch discrimination remain unverified.
Historical reports describing uncommitted builds retain their original context;
commits were subsequently authorized. The current local transport follow-up has
not been deployed separately. Duplicate-post prechecks and clearer duplicate-place
summaries are reserved for the next branch.
