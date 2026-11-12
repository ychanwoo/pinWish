# CSUSM cover-photo regression

> Historical validation snapshot. Results, counts, deployment statements and remaining work below describe the recorded run, not the current release. See the [current documentation index](../README.md) for implemented behavior and verification status. Original evidence is preserved.

Validated November 11, 2026.

The name/coordinate match correctly identified California State University,
San Marcos, but Wikipedia supplied no primary `pageimage`. Article images such
as `Csusm from sprinter.jpg` and `Kellogg Library.jpg` did not meet the existing
two-name-token filename filter, so discovery returned `not_found`.

Discovery now also reads the matched entity's non-deprecated Wikidata P18 images.
It retains the name/coordinate match, Commons host allowlist, JPEG size limits,
license/attribution checks and exclusion of logos, seals and diagrams. No arbitrary
article images are accepted simply to fill the placeholder.

Discovery version 2 invalidates old `not_found` cache entries once, so reopening
an already saved place queues discovery without deleting or resaving it. Current
negative results retain their cooldown; existing photos are unchanged.

Validation:
- 95 unit tests passed, including verified-entity images without venue words in
  the filename and one-time old negative-cache invalidation.
- 26 cloud UI regression tests passed.
- Lint, type checking and production build passed (existing map bundle warning).
- A real AWS Lambda worker discovered the CSUSM image and stored a re-encoded
  1024 × 771 JPEG (211,757 bytes) in S3. The S3 object was successfully retrieved.
- The isolated validation record and S3 object were removed afterward.

The photo worker code was updated without resetting the user's active bounded
runtime window or its scheduled automatic pause. No commit or push was made.
