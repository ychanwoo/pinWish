# Interactive saved-place map validation

Branch: feat/interactive-saved-places-map

- MapLibre renders Amazon Location Maps V2 in cloud mode. Renderer/worker are
  bundled locally; the renderer loads as a separate lazy chunk.
- Marker positions use stored confirmed coordinates, not sample design offsets.
- Cluster expansion, selected-place highlight, camera movement, fit-to-view,
  resize handling, reduced-motion preference and keyboard place selection.
- All storage pages load into one snapshot; failed pagination preserves the prior
  snapshot with a retry message. Account changes invalidate pending loads and
  destroy the old map instance.
- Pins follow collection/search/visited filters; save/delete alter the same state.
- Invalid coordinates do not enter GeoJSON. Source text is never injected as HTML.
- Native provider attribution and scale remain visible.

## Automated checks

- 58 unit tests passed, including coordinate/GeoJSON validation.
- 12 authenticated storage UI tests passed.
- 12 import/confirmation UI tests passed.
- 24 existing demo UI tests passed; 2 intentional mobile skips.
- 3 map browser tests passed: pagination, selection/detail switching, filters, logout,
  rendered canvas dimensions, map failure/retry and mobile overflow.
- Lint, TypeScript and production build passed. MapLibre's lazy renderer remains
  a large bundle (about 291 KB gzip plus its worker); Vite reports a size warning.

## Actual AWS check

`pinwish-storage-dev` updated successfully with a map-only key expiring
2027-01-01 UTC. Actual AWS styles, tiles and glyphs loaded in Chromium in both Vite development
and production preview builds, and a
screenshot confirmed the map and selected marker beside the dossier.
See `interactive-map-live.json` for the result. This check uses fixture accounts
and place records with real AWS map requests; it does not claim a new end-to-end
Cognito/DynamoDB test. Existing real storage validation is recorded separately.
The AWS style emitted nonfatal style-expression warnings for some provider tile
attributes; no page exception or map request failure occurred.

No new user accounts or saved records were created. The temporary key used to
isolate an unsupported permission entry was removed. Initial deployment rolled
back cleanly; the corrected deployment completed. Credentials and map key values
are excluded from these records.

## Scope

No in-map directions, transit layer, public list sharing, native app share target,
or new Korean place provider. Frontend/import API production hosting is still a
later task. Browser coverage here is Chromium desktop/mobile emulation, not real
Safari/iOS hardware. Keep the AWS budget alert and remove the key after the demo.
