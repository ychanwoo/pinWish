# Automatic representative photo validation

The former manual-upload implementation has been replaced. No upload UI or upload
API remains. Saving a place starts a background AWS Lambda job; opening an older
saved place starts the same discovery if needed. The detail photo loads without
file selection. Photos are discovered dynamically, not mapped to hardcoded venues.

## Evidence

- `automatic-photo-discovery.json`: the 10 saved locations from the real LA post
  were passed through the production discovery code. All 10 returned downloadable
  Commons JPEGs with attribution. These are local provider/download checks, not
  ten separate end-to-end AWS imports.
- `place-photos-live.json`: actual Cognito → API Gateway → Lambda → DynamoDB/S3
  test. Saving Gamble House attached a photo before any photo endpoint was called,
  proving background discovery is triggered by the save. Authenticated retrieval,
  private S3, cross-user denial, removed upload route and deletion cleanup passed.
  A real local browser signed in and displayed the downloaded photograph on desktop
  and mobile, enlarged it, and reported no JavaScript errors or horizontal overflow.
- Unit tests cover idempotent queueing, preserved concurrent notes, deleted places,
  missing/provider-failed photos, cleanup, ownership and download URL restrictions.
- Browser tests cover pending-to-ready automatic loading, credits, enlargement,
  reload, errors/retry, no-match behavior and absence of upload controls.

Validation: 71 unit tests, 18 cloud/photo browser tests, lint, TypeScript and
production build passed. Import tests: 13 passed; map tests: 3 passed; demo UI
tests: 24 passed, 2 intentional mobile skips. Existing Vite large-chunk advisory
remains. The updated AWS stack reached UPDATE_COMPLETE.

## Matching and limitations

Wikipedia/Wikidata titles and coordinates must agree with the saved place. Article
images are fetched from Wikimedia Commons, with an allowlist of reusable licenses.
The worker rejects unsupported images and links; it does not substitute random
stock images. The exact article's lead photo is preferred; eligible photos from
that article can be used if the lead photo's license is unsupported. Adjacent
businesses sharing a street/city name must not become that place's cover photo.

Commons does not cover every business, and matching is heuristic. Ten successful
LA samples do not establish universal coverage or current appearance of a venue.
No-match results are cached for 24 hours, temporary provider failures for five
minutes. Photo failure never prevents location storage. Source and license links
are displayed; cached resized copies retain their source license.

## Local review

1. Start `npm run dev` and `npm run dev:api`, then sign in.
2. Paste the Instagram post URL and add its resolved places.
3. Open a saved place. A pending photo resolves automatically to its representative
   photo; there is no upload or file-selection step.
4. Reload and open it again; the cached photo is retrieved from private AWS storage.
5. Open a place saved before this feature to exercise automatic backfill.
6. Click the photo to enlarge it; inspect source/license links and mobile layout.

The actual-AWS test uses temporary accounts and records and deletes them afterward.
No existing user's saved places or photos are removed. No commit or push is part of
this validation.

## Photo loading performance

The active collection starts bounded, paced prefetch before opening a detail
view. A ten-minute, account-scoped memory cache avoids repeat API/S3 transfers.
Tests block photo network requests after prefetch and verify both first opening
and reopening still display the photo, then verify logout clears the cache.
These verify removal of the repeat network dependency, not a measured production
latency guarantee. Cold discovery and a click before prefetch finishes can still
show loading. No infrastructure changes are required for this optimization.
