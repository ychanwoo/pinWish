# Direct place search

Branch: `feat/direct-place-search`.

## User flow

Open **Save a place / Add pin** and choose **Place search**. Enter a place name
or address and optionally a city or region. Search requires sign-in; the draft
survives the sign-in dialog. Results show English names, addresses and countries.
Select one result explicitly, choose an existing collection or select **Create a
new collection…**, enter its name and press **Create**. A newly created collection
is selected automatically and can be renamed/deleted from the sidebar menu.
Creation retries reuse the same ID for an unchanged name; cancelling after a
successful creation keeps that empty collection. Add an optional note, then
press **Add to map**. The saved place opens in the detail panel on its map.

The original query is retained as `searchOrigin.query`, including Korean input.
The existing query resolver converts overseas Korean queries where possible;
confirmed overseas venues use the provider's English name. South Korea detailed
place coverage remains unsupported by the existing provider integration and is
not silently simulated. No new category inference or public sharing is included.

Searches run on submission, not on each keystroke. Editing a query or region
cancels pending browser requests and discards stale results. An already submitted
AWS job may finish within the existing server limits. Closing preserves query, region,
note and collection, but reopening requires searching and selecting again.
An input change or Change action invalidates the selected result. A failed save
retains the selection and draft for retry. An expired result requires a new search.

## Storage and authorization

- Search and details use existing authenticated `/jobs` operations and existing
  Amazon Location/Bedrock limits. No additional paid provider is introduced.
- The frontend exposes the completed details job ID internally as an
  `X-Pinwish-Job` response header on its locally constructed processing response.
  This is not an API CORS header or a bearer credential.
- `POST /places` accepts `{ directSearch: { detailsJobId, query, region }, note,
  collectionId }`. The browser does not supply trusted venue coordinates.
- Storage reads `USER#<authenticated-sub>/JOB#<detailsJobId>` from the jobs table.
  It requires a completed, unexpired **details** job and validates the returned
  place. Search jobs, other users' jobs and missing/expired results cannot save.
- Name, address, country and coordinates come from the server's verified details
  result. Client-supplied `place` fields cannot override these values. The existing
  job TTL is 24 hours; a search selection token still expires after 15 minutes.
- New direct records have `sources: {}` and `searchOrigin: { query, region }`.
  No Instagram URL or photo slide is fabricated. Detail Origin reads
  **Added from place search**. Existing records with no source information show
  **Source unavailable**.
- Provider-ID deduplication is shared with Instagram imports. Repeated direct
  saves return the existing place without replacing its note, collection, visited
  state or sources. A later Instagram import can add its real source to the same
  place. The UI explains when an existing place has been kept.
- Existing photo discovery, S3 caching, visited status, move and delete operations
  apply to directly saved places. Photo availability still depends on coverage.
- Storage's role gains only `dynamodb:GetItem` on the jobs table; the jobs table
  name is passed as `JOBS_TABLE`. There is no new table or always-on service.

## Local validation

November 11, 2026: 173 automated tests passed (93 unit, 10 direct UI,
26 cloud UI, 25 demo UI, 13 import, 3 processing and 3 map); 3
platform-specific demo tests were skipped. Lint, TypeScript and production build
passed. The existing MapLibre bundle-size warning remains.

The real AWS check passed all five checks. Two temporary users and their data
were removed; final runtime status confirmed paused hosting/map/API, disabled
cleanup and automatic-pause schedules, and zero worker concurrency. The backend
was updated; the new frontend was not deployed. This records the live-check state before the later local review and commits.

The live test refreshes the record before editing because background cover-photo
completion may increment its version. It also retries transient gateway-level
403/404 responses briefly after re-enabling the endpoint, without retrying
application-level authorization or missing-resource errors.

```sh
npm run check
npm run test:unit
npm run test:direct-ui
npm run test:cloud-ui
npm run test:processing-ui
npm run test:import-ui
npm run test:map-ui
npm run test:e2e
```

The direct browser suite uses authenticated job fixtures and covers desktop and
mobile selection, saving/reload, keyboard-accessible native controls, header/footer
visibility, retry, duplicates, empty results, cancellation, changed details and
expired sessions. Unit tests verify server-side provenance, owner isolation,
expiry, malformed data, original query preservation and import/direct deduplication.

For a bounded real AWS check after deploying the backend:

```sh
PINWISH_RUN_LIVE_DIRECT_TESTS=1 node scripts/cloud/validate-direct-search-live.mjs
```

This script opens a 15-minute test window, creates temporary Cognito users,
searches English and Korean names using real AWS services, selects a real result,
saves/reloads it, tests duplicate and foreign-account rejection, updates visited
status and deletes the test place. Its `finally` block pauses the runtime and
removes temporary users, DynamoDB rows and S3 photo objects. Results are recorded
in `docs/validation/direct-place-search-live.json`. The check incurs normal
per-request charges; pausing does not eliminate retained storage charges.

For manual local review, run `npm run dev` and open a bounded test window with
`npm run cloud:test:start -- 15`. Finish with `npm run cloud:test:stop`.
The new frontend must be deployed separately to appear on the hosted website.

## Collection choice and card follow-up

The collection picker loads the owned collection catalog and supports inline creation
without losing the selected place or note. The Add to map action stays disabled
while a new collection has not been created. All collections, including Saved places,
support Edit name and Delete. Deleting the fallback selects another collection;
deleting the last collection creates a new Saved places destination to preserve places.
Menus render outside sidebar clipping and flip above the trigger when needed.

The cloud place list now uses subdued selection borders/backgrounds, a neutral
unvisited label, a green visited label and a plain note separated by a thin rule.
No pink block, thick accent rail or white italic note card remains in cloud mode.
Final validation: 96 unit, 12 direct-search and 28 cloud browser tests passed,
including desktop/mobile creation, ambiguous-response retry, persistence, menu
availability, and the existing rename/delete lifecycle. Lint/typecheck/build passed.
