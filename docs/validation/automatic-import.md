# Automatic import and English display

The earlier manual place-confirmation flow is superseded for Instagram imports.
Cloud mode now performs serial provider search/details lookups for every extracted
candidate, saves the located places automatically, and opens the map when the
whole batch succeeds. A partially unresolved batch still saves the located
places and lists failures with Retry missing places / View map actions. A failed
storage request retains the batch for an idempotent save retry.

Printed location/address text is preserved as locationHint and used as search context.
Named provider results must share at least two thirds of significant query tokens;
provider rank breaks ties. If precise address search returns unrelated tenants, a
second query retains the supplied city/state but removes the street/postal constraint.
Unresolved Korean-to-English conversion cannot silently save a street fallback.
This lexical check is a heuristic, not semantic proof of venue identity.
This is not a claim that every provider match is the intended branch. No OCR or
model-generated coordinates are accepted. Detail identity/country must match the
search selection. Original Korean names/evidence/slide references remain in
stored source data; the UI uses English overseas labels and does not render the
Korean source evidence there. Korean labels are allowed for confirmed KR records;
the existing AWS detailed-place coverage limitation for KR has not changed.

The photo link is now View original photo ↗, opens a new tab, and retains the
original post/slide target. There is no mandatory per-place confirmation action.

Checks:
- 64 unit tests passed, including display-language fallback and preservation.
- 13 import browser tests passed: automatic English resolution, retry,
  cancellation/reopen, partial resolution, identity mismatch, no English title,
  unsupported country, malformed extraction, empty extraction and original links.
- 13 cloud browser tests passed, including automatic save with no confirmation,
  preserved Korean source data with an English-only dossier, and partial-save retry.
- 3 map browser tests passed.
- Lint/TypeScript/production build passed; the known lazy-map bundle warning remains.

Browser tests use synthetic responses. Live evidence is recorded separately and
must not be interpreted as proof that arbitrary Instagram posts always work.

## Live post-to-map check (2026-11-10)

A final fresh request for `DfFCMjzk02S` read 12 photos and extracted 10 candidates.
A temporary real Cognito account made 11 search requests (including regional
fallback), saved all 10 through API Gateway/Lambda/DynamoDB, and displayed 10
entries in the live map. Reload retained all 10. The rendered page contained no
Hangul; original Korean source evidence remained in the saved records.

The photo-4 OCR error is still preserved in source data, but its printed address
allows the English query to resolve Point Dume State Beach. Bradbury Building was
verified at 304 S Broadway rather than an unrelated tenant. Randy's Donuts now
matches the source address at 805 W Manchester Blvd. Hermosa Beach Pier's provider
details use the shorter title Hermosa Beach at 1 Pier Ave. See
`automatic-import-live.json` for the full result and addresses.

Earlier validation attempts exposed an unrelated tenant result and overly strict
handling of possessive English transliterations; both were addressed before this
final run. This sample result does not guarantee arbitrary posts or future model
responses. No sample-specific venue replacement table is used at runtime.

The temporary account and its 10 test records were deleted. Validation used the
production preview build to avoid development hot-reload interruptions.

Retry missing places now has a brand-colored outlined button, keyboard focus
state and a full-width mobile touch target. Restart the local API process after
pulling backend extraction/query changes, then import the original link again so
printed address hints are included in the new extraction.
