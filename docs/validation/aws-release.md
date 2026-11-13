# AWS release validation — November 12, 2026

Validation branch: `test/aws-release-validation`.
Base application commit: `2e93b34fcb6a5624f9dfe1d90a6760c7fa23bef1`.
The working tree includes validation tooling, evidence, route-matrix and null-storage fixes, and recovery from initial collection reads and transient query-conversion failures. No visual design changes were made. Validation was performed on the working tree before the work-unit commits on this branch.

## Scope and data protection

Use newly created validation accounts and remove only their records and photos. Before deployment, read-only fingerprints recorded 1 existing Cognito account, 11 persistent user records and 9 photo objects. No record contents or account credentials are included in the release evidence. Compare those fingerprints after cleanup; temporary provider caches and quota counters are operational data and are not user content.

The existing personal account is excluded from sign-in, password reset and all mutations. A separate, previously unused email supplied by the owner is used for real confirmation/reset delivery; its temporary account is removed after verification.

## Local regression checks

- `npm run check`: passed lint, TypeScript and production build. Existing large-bundle warning remains.
- Unit tests: 140 passed.
- Browser suites: preview 25 passed / 3 intentional platform skips; import 15; cloud 42; map 8; direct search 12; processing 3. Total: 105 passed.
- Fixtures exercise loading, failures/retries, session expiry, private links, isolated records, provisional journeys, collection changes and desktop/mobile layouts without paid provider calls.

## Deployment

- Existing stack: `pinwish-storage-dev`, region `us-east-1`.
- Amplify app: `d297h6ubgr1uhw`, branch `demo`, deployment job `16`.
- [Demo](https://demo.d297h6ubgr1uhw.amplifyapp.com).
- Backend update and frontend deployment succeeded. All six uploaded JavaScript/CSS assets and all four Lambda code payloads match their recorded SHA-256 hashes. The frontend is job 16; the backend was subsequently updated with the null-storage fix and audited again.
- Bounded 15- and 30-minute runtime windows were used with automatic pause armed before access was enabled. Each live browser attempt paused runtime after cleanup.

## Live validation

**Passed.** The final combined browser run completed all 14 checkpoints on the deployed frontend and backend. Real email signup verification, sign-in/out, password-reset code acceptance and sign-in with the new password also passed. [Machine-readable evidence](aws-release.json) contains artifact hashes and the final checks.

- Real Instagram carousel: 12 photos, 10 English locations saved, retained after reload; account/job isolation verified.
- Representative photo, sidebar, desktop/mobile overflow checks, notes, visited state and collection colors passed.
- All nine selected unvisited places were included in a saved journey. Three unknown-hours notices matched the stored data; unavailable routes were labeled explicitly. Save, reopen, edit, share, revoke and delete passed.
- Direct CSUSM search/save, collection creation/rename/move/delete, and preservation of the moved place and visited state passed.
- Anonymous collection/journey sharing, private-note exclusion, revocation, private-link authentication and signed-out save restrictions passed.
- No uncaught browser exceptions or cleanup errors. One HTTP 429 during saving recovered through the existing bounded retry. The diagnostic listener also recorded 24 cancelled response bodies **after HTTP 202 job acceptance**; those jobs completed, and no request failure without an accepted response remained.

## Cleanup and remaining limits

Final fingerprint comparison: **11/11 persistent user records, 1/1 existing accounts and 9/9 photos unchanged**, with no missing, modified or additional entries. All validation accounts and their disposable data were removed. The final runtime check confirmed paused hosting/map, disabled API and cleanup schedule, zero application-worker concurrency, and a disabled automatic-pause schedule. Retained storage can still incur charges.

No email test remains deferred. All issue-37 acceptance checks are complete for the recorded scenarios. External provider/AI results, future traffic, holiday opening hours and photo coverage remain product limitations. The exact transport-level cause of the earlier fetch rejection was not captured; the resulting empty-catalog/save failure was reproduced and fixed. The production build still reports its existing large-chunk warning. No visual design was changed. Deployment evidence describes the validated artifacts, independently of subsequent Git commits.

## Defects and harness corrections

- **Route matrix boundary:** the UI accepts 3–20 stops, but a single unbounded AWS request accepts at most 100 pairs. The backend now assembles at most four 10×10 chunks using the same departure and mode. A failed chunk never produces a cached partial matrix. Limits remain 20 stops / 400 billed route pairs; no fabricated travel estimates are introduced. This correction was deployed without changing the frontend design.
- Unit checks now cover 10, 11 and 20 places, matrix row/column ordering, full-cache reuse and failure of a later chunk. All 140 unit tests passed; the expanded 42-case cloud browser suite and `npm run check` passed again.
- A real-provider 20-place boundary probe passed: four AWS route requests, 400 pairs, all 20 selected stops retained, and no further provider requests on repeat. This probe used in-memory storage and synthetic places/opening hours with real AWS routing; it did not create AWS user data and is not represented as a 20-venue live-hours test.
- The first extended browser attempt encountered the existing optimistic-concurrency protection when photo completion advanced a directly saved record's version. The UI rejected the stale edit with refresh guidance; the test now reloads the persisted record before editing. No forced overwrite or weakened version check was introduced.
- The second attempt found a test sequencing error: it read the collection catalog before the asynchronous rename finished. The harness now waits for the renamed collection to appear before proceeding. Earlier attempts are retained as incomplete, not counted as fully successful runs.

- **Failed initial collection read:** the failed browser trace showed `Failed to fetch` followed by “This collection is no longer available,” despite ten successfully resolved locations. The failed read left the catalog empty, and saving interpreted that as deletion. Read requests now retry network/timeout/5xx failures at most twice; writes are not automatically replayed on a lost response. Saving after a failed initial load retrieves the authenticated catalog before checking the destination, then reloads saved places. A genuinely missing collection remains an error. Three regression cases verify a transient network failure, a 503, and saving after all three initial read attempts fail. The exact transport-level cause of the earlier fetch rejection was not captured; it is not attributed to CORS, throttling or AWS propagation without evidence. Live validation now records failed API requests and HTTP errors.

- **Transient name conversion:** another real run saved nine of ten places. The missing Union Station candidate had a query-conversion status of `unavailable`; other search jobs completed. Automatic lookup now retries this status once, preserving the original name and still requiring a translated, matching provider result. `needs_review` is not bypassed. Regression tests verify both recovery and a second failure that remains explicitly unresolved. This does not promise perfect AI extraction or provider availability.

- **Unknown route persistence:** a real nine-stop journey returned 503 because a provider-unreachable leg correctly produced `travel: null`, but the DynamoDB encoder did not support null. The serializer now round-trips DynamoDB `NULL` values. A replay of the actual temporary test journey retained all nine stops and its one unknown-route notice. Regression coverage exercises preview, persistence, reload and anonymous sharing with an unreachable leg; no zero-minute substitute or fabricated route is used.

## Reproduction

Run local checks from [the development guide](../local-development.md). For explicitly authorized real-provider validation:

```sh
node scripts/cloud/audit-release-data.mjs before
npm run deploy:backend
npm run deploy:web
npm run cloud:test:start -- 15
node scripts/cloud/audit-release-artifacts.mjs
PINWISH_RUN_ROUTE_BOUNDARY_TESTS=1 node scripts/cloud/validate-route-boundary-live.mjs
PINWISH_RUN_LIVE_WEB_TESTS=1 PINWISH_RUN_RELEASE_TESTS=1 node scripts/cloud/validate-web-live.mjs
npm run cloud:test:stop
npm run cloud:status
node scripts/cloud/audit-release-data.mjs after
```

The data audit writes a private, ignored fingerprint baseline and deliberately refuses to overwrite an existing baseline. Archive the previous run's baseline before starting a separate review. Do not rerun `before` mid-test. The artifact audit requires an active website and compares JavaScript/CSS from the uploaded deployment archive plus the four deployed Lambda code payloads; it never records temporary download URLs.

The extended web validator creates two suppressed-email accounts, uses the actual hosted application and paid AWS providers, then deletes only its own accounts/records/photos/share lookups and pauses runtime in `finally`. If any command fails, still run `cloud:test:stop` and inspect cleanup results before retrying. Do not run overlapping scripts that independently pause the same runtime.

The email validator is separate and interactive:

```sh
PINWISH_RUN_EMAIL_TESTS=1 PINWISH_TEST_EMAIL=<unused-receiving-address> node scripts/cloud/validate-email-live.mjs
```

Use a new address with the owner's permission. The script refuses existing accounts, waits at most ten minutes per code and deletes the account it creates afterward. Supply each received six-digit code locally in ignored `infra/generated/release-email-code.txt`; never commit it. It does not open/extend a runtime window or pause it, so start a sufficient bounded session before this check and stop it afterward. Interrupting with Ctrl-C requests cleanup while waiting for a code. Actual email confirmation/reset verification passed in this review; a future rerun still requires a fresh, receiving test address and real codes.
