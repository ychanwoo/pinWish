# Read-only collection sharing

## Product behavior

- Desktop: collection `⋮` → **Share collection**. Mobile: **Manage collection** → **Share collection**.
- Sharing is off until the owner chooses **Create sharing link**. Anyone with that link can read the collection; no PinWish account is required.
- Public fields: collection name, place display names, addresses, countries, coordinates and available representative photos with attribution.
- Personal notes, visited/bookmarked state, email, account identifiers, Instagram/source evidence, original queries and private S3 keys are excluded by a server-side allowlist.
- Collection names and membership are live. Rename, add, move and delete changes appear on refresh. Public pages revalidate when focused and every 60 seconds while visible.
- **Stop sharing** asks for confirmation and blocks subsequent API/photo requests for that token. Creating a new link uses a different token. Already downloaded/viewed information cannot be recalled.
- Deleting the original collection invalidates its links even when its places move to another collection.
- Links expire after 30 days. The owner can create a new link after expiry. Active links are reused on retries.
- Shared pages are read-only. Directions opens Google Maps externally; no account mutation controls are provided.
- Photo access reads only existing cached S3 objects. Public visits never start discovery, OCR, translation, or place-search jobs. Missing photos do not prevent browsing.
- The public map reuses the existing Amazon Location map and its restricted browser key. Maps are unavailable while the AWS test session is paused.

## API and storage

Owner routes (Cognito access token required):

- `GET /collections/{id}/sharing`
- `POST /collections/{id}/sharing`
- `DELETE /collections/{id}/sharing`

Public routes (GET only):

- `GET /shared/{token}?cursor=<last-place-id>`
- `GET /shared/{token}/places/{id}/photo`

A token is 32 cryptographically random bytes encoded as hex. The URL uses `/#share=...`; fragments are not sent to the frontend host or in referrers. The frontend sends the token only to the sharing API, without cookies or authorization headers. Do not log or publish real share tokens.

The existing Places table stores a `SHARE#<SHA-256(token)> / LINK` lookup with owner, collection ID and `expiresAt`. The private collection catalog holds the currently enabled token and expiry. A lookup alone grants no access: every public request checks the live catalog, collection membership and expiration. Catalog updates use the existing compare-and-swap retry. Lookup writes that lose a creation race are harmless and expire through TTL, as do revoked/deleted links. Expiration is checked in application code, independently of asynchronous DynamoDB TTL deletion.

Collection settings are excluded from the normal collection list response. Public photos return image bytes and attribution, without a public bucket or a presigned URL that could outlive revocation. Public APIs return `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow, noarchive` and `nosniff`; the page also requests no indexing. Search-engine directives are not access controls: anyone possessing the link can forward it.

Public routes have API Gateway route throttles of 2 requests/second with burst 5, in addition to existing runtime controls. No new always-on service or table is added. Requests, maps and retained storage can still incur usage charges; throttling is not a billing cap.

Public queries read up to 50 owner rows per page, filtering by the current collection. Cursors contain only a place ID and cannot select another account. The UI follows at most five pages initially, then offers **Load more places**. Counts and map pins reflect loaded places when pagination remains. Large sparse collections can require several loads.

## Local and live review

```sh
npm run check
npm run test:unit
npm run test:cloud-ui
npm run test:map-ui
npm run test:direct-ui
```

These automated tests use fixtures and make no AWS calls. For explicit real API checks:

```sh
PINWISH_RUN_LIVE_SHARING_TESTS=1 node scripts/cloud/validate-sharing-live.mjs
```

The script opens a 15-minute test window, creates two temporary Cognito users, seeds a synthetic place and private S3 JPEG, checks anonymous reads and photo attribution, owner isolation, revocation and collection deletion, then pauses the runtime and removes temporary accounts, records, lookups and images. No OCR/place-search call is made. Results are recorded in `docs/validation/collection-sharing-live.json`.

For manual review: create a link, open it in a private browser window, check the list/map/detail, then stop sharing and refresh the private window. A localhost link only works on the same computer; use the deployed website to create a link for friends. Tests and demos require a bounded AWS runtime window; stop it after testing.
