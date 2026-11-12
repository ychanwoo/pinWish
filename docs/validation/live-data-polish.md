# Live-data UI polish

> Historical validation snapshot. Results, counts, deployment statements and remaining work below describe the recorded run, not the current release. See the [current documentation index](../README.md) for implemented behavior and verification status. Original evidence is preserved.

Branch: `ui/live-data-polish`. Local validation: November 11, 2026
(America/Los_Angeles).

## Behavior

- Recently added sorts the entire loaded collection by `createdAt`, newest first,
  independently of DynamoDB key order and later edits. Invalid/missing dates sort
  last; ID breaks date ties. Name sorting is deterministic and does not mutate
  the loaded array. Both controls are available on desktop and mobile.
- Search includes the saved address as well as name, kind, country, note and tags.
  List cards and map pins share a filter function. The unvisited filter is usable
  on desktop as well as mobile. Collection counts remain total collection counts;
  result counts represent the active filters.
- The current API stores broad place types, not reliable Coffee/Food/Culture
  categories. Cloud mode therefore hides those unsupported category tabs rather
  than guessing venue categories from names. Stored records retain Other; no
  migration, provider lookup, or classification charge is introduced. Demo mode
  retains its explicitly seeded categories.
- Cloud settings/region/more-options placeholders are removed. The sidebar scope
  is plain text. Provider types are presented as readable labels (for example,
  PointAddress → Address). Unknown types use Saved place.
- Saved dates use English date labels or Date unavailable. Mobile note editing
  no longer shows a fixed Updated 2d ago timestamp. Unknown hours have no green
  open indicator; saved venues have no decorative verified badge. Empty notes
  show No note yet and empty tag sections are omitted.
- External route controls describe Google Maps. No in-app route calculation is
  implied or implemented.
- Copy private link explains that it requires the owner's account. Opening the
  link restores the matching detail after login and after every page of owned
  records has loaded. An unavailable ID reports that it is not available in the
  current account; it does not request or expose another user's data. Public
  sharing remains a separate feature.
- The cloud save dialog requests an Instagram post link, not arbitrary addresses
  or Google Maps URLs. Unsupported input is retained with a validation message;
  sample names cannot resolve into pretend cloud saves. Direct search will be a
  separate feature. Demo-only preview state URLs do not open sample cloud UI.
- Initial loading and load failures are distinct from an empty collection.
  Failed requests retain the refresh action and existing data where available.

## Verification

Final local results: 160 tests passed (90 unit, 26 cloud UI, 25 demo UI,
3 map, 3 processing, 13 import); 3 platform-specific demo tests skipped.
`npm run check` passed lint, type checking and production build.

The unit suite covers date sorting, tie-breaking, missing/invalid values,
readable type fallbacks and existing backend behavior. Browser fixtures cover:

- Out-of-order paginated records sorted after reload.
- Name sort, address search, unvisited filter and matching map selector counts.
- Desktop/mobile controls, empty notes, absent placeholders and horizontal fit.
- Private link copy/reopen and unavailable IDs after login.
- Loading/failure/retry without a false empty state.
- Unsupported direct text input retaining its value without a demo result.
- Existing authentication, import, collection CRUD, photos, live-map rendering
  with mocked provider responses, and cloud job polling.

Tests call mocked endpoints, not paid AWS APIs or Instagram. This UI-only branch
changes no AWS infrastructure or persisted records. It has not been deployed;
real email delivery, arbitrary-post extraction and production performance remain
outside this validation. The previously documented map bundle-size warning
remains. No commit or push is included in implementation work.
