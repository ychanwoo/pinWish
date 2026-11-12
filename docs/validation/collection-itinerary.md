# Itinerary validation — November 11, 2026

## Automated and visual checks

- 116 unit tests passed, including provider-hour parsing, overnight carryover, weekday closures, daylight-saving conversion, manual hours, missing hours, impossible travel, long visits, manual order and bounded multi-order search.
- 37 cloud UI tests passed, including four itinerary flows on desktop/mobile, unknown-hour correction, anonymous links, persistence and draft review.
- 12 existing direct-search UI tests and four map tests passed.
- Lint, TypeScript and production build passed. Existing large-bundle warnings remain.
- Desktop and mobile planner/review/result/shared screens reviewed from screenshots; 320px viewport checked for horizontal overflow.
- API tests cover owner isolation, duplicate-save retry, stale-version rejection, collection deletion, sharing/revocation, expired contexts, provider failure, missing places, and paid-request quotas.

## Real AWS evidence

`collection-itinerary-live.json` records five passing deployed checks using two temporary accounts:

- Unauthorized/foreign-account preparation rejected.
- Fresh provider opening hours and America/Los_Angeles time zone returned.
- Actual driving matrix used; a Wednesday-closed museum was moved to another day. Each scheduled visit was checked against its provider opening interval.
- Private save/reload and anonymous field filtering passed.
- Revocation and deletion invalidated previously issued links.

A real anonymous browser opened the deployed shared trip on desktop and mobile. Owner interaction is covered by mocked-provider browser tests; owner APIs were exercised against actual AWS. This does not claim end-to-end manual verification of every venue or every travel date.

The public search probe returned **The Broad-Lower Parking**, Griffith Observatory and Los Angeles County Museum of Art. That first result is retained under its actual provider title, not silently relabeled as the museum. Production planning retrieves the already-saved provider ID and checks coordinates; the validation does not prove provider naming/hours are universally accurate.

The frontend and backend were deployed. Test users, saved places, contexts, previews, itineraries and share lookups were removed, and runtime paused. Global quota bookkeeping expires after two days; earlier probe-run quota entries also expire by TTL.

## Costs and limits

AWS Price List API for us-east-1 reports Stored GetPlace at $0.004/request and core route matrix at $0.0005/origin-destination pair. A new 10-place context plus 10×10 matrix is about $0.09, or $0.28 for 20 places, before other services/free-tier credits/taxes. See `itinerary-pricing.json`. Same-context duration/order edits reuse the matrix. These are reference calculations, not a billing guarantee.

## Explicit limitations

Weekly opening hours are provider supplied; holiday closures, reservations and last-entry times require confirmation. Unsupported/missing hours cannot be treated as known. Category-based visit lengths are estimates editable by the user. Traffic estimates use the first departure time with a 20% allowance; later-day congestion is not separately predicted. The trip is bounded to 3–20 places, a single known time zone, and at most seven days. Lunch is fixed at 12:00–13:00 and overnight hotel/airport transfers are not modeled. No AI API is used for scheduling.

## Final refinement verification

After the original live run, unknown-hour visits were made provisionally schedulable with explicit notices, trailing empty days removed, and complete plans compared for daily balance. Interface wording now uses Journey, with revised shared-page typography. Fifteen targeted backend tests and four browser tests passed; lint, TypeScript and production build also passed. Scheduling updates were deployed with runtime paused. Latest frontend refinements are local and have not yet been deployed or retested against live AWS.
