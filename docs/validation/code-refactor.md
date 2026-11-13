# Code refactor verification — November 13, 2026

Branch: `refactor/code-modularization-and-render-performance`.
Baseline: `66dd070b4c366777cea2a97842d4cf5372cd0165`.
[Machine-readable measurements](code-refactor.json) and [module responsibilities](../code-architecture.md).

## Scope

Feature folders, lifecycle hooks, presentation components, consistent workspace reads, shared owner checks and DynamoDB serialization were separated without changing record formats, API routes, CSS, assets or provider quotas. The existing component entry names remain recognizable under their feature directories. No dependency or framework upgrade was required.

The AWS runtime was not enabled, no deployment was performed, and no cloud resources or user records were changed. `infra:build` only generated a local template and bundled the extracted backend module. Live AWS release evidence remains the separate November 12 report; these local changes have not been deployed.

## Measured performance

| Measurement | Before | After |
| --- | ---: | ---: |
| Main production JavaScript entry | 526.77 kB | 351.16 kB |
| Main entry, gzip | 159.83 kB | 107.12 kB |
| Map data worker messages from six sidebar toggles | 12 | 0 |

The main entry is about 33% smaller. These are decimal kB from the same project's build settings, not the total size of all dynamically loaded assets. Cognito transport, journeys and shared pages now load when needed; their cost is deferred, not eliminated. Existing authenticated map sessions still load MapLibre. Its approximately 1.085 MB asynchronous chunk still produces Vite's large-chunk warning. No warning threshold was raised or warning suppressed.

For the worker experiment, the same browser test was run against a temporary baseline checkout and the refactored source with local fixtures. It instruments the installed MapLibre version's `LD` worker messages after initial map work settles. Six sidebar visibility toggles caused 12 unnecessary data rebuild messages in the baseline and none after memoizing map inputs and removing hours-only dependencies. This is evidence of reduced redundant work, not a claim about universal FPS, network latency or percentage improvement in page load time.

List filtering/sorting, saved-place signatures and collection counts are memoized by their real inputs. Counts now use one pass through places rather than a scan for each collection. Actual map selection, visited-state, color, filter and account changes remain covered by the map tests.

## Behavior and visual verification

- `npm run check`: lint, TypeScript and production build passed.
- `npm run test:unit`: 140 passed.
- Browser suites: preview 25 passed / 3 intentional platform skips; import 15; cloud 42; direct 12; map 9; processing 3. Total: 106 passed.
- `npm run infra:build`: local backend bundling/template generation passed.
- Existing cancellation, idempotent retry, expired session, cross-account isolation, collection menu keyboard/focus, notes, photos, visited states, color, public links and journey checks remain enabled.
- A new map regression test verifies unrelated sidebar changes do not send GeoJSON back to the worker.
- CSS, design tokens and image assets were not modified. Production CSS hashes match the baseline.
- Eight desktop/mobile journey reference images were compared. Seven are byte-identical. The remaining 1440×900 review image differs by one pixel at (237, 338), on the date field's focus outline; direct inspection showed no layout, text, typography or component change. Per-image hashes and pixel counts are recorded in the JSON evidence.

An intermediate lazy-loading version exposed a collection-dialog focus-return regression. Authentication, import, direct search and collection-management dialogs were retained as eager components to preserve their original focus capture timing. The existing focus assertion passes on the final version. The final browser results above come from completed runs after the changes, not from incomplete development iterations.

## Reproduction

From the repository root, run:

```sh
npm run check
npm run test:unit
npm run test:e2e -- --workers=2
npm run test:import-ui -- --workers=2
npm run test:cloud-ui -- --workers=2
npm run test:direct-ui -- --workers=2
npm run test:map-ui -- --workers=1
npm run test:processing-ui -- --workers=2
npm run infra:build
```

The browser configurations supply local fixtures and test endpoints; do not replace them with live credentials. The focused worker measurement is:

```sh
npm run test:map-ui -- --grep 'unrelated sidebar' --workers=1
```

For a baseline comparison, copy that test to an isolated checkout of the recorded baseline and run with `PINWISH_RECORD_BASELINE=1`; this logs its count without enforcing the optimized zero-update assertion. Keep the application source unchanged while running the comparison. Build sizes can be reproduced with `npm run build` using identical build-time configuration.

The existing journey browser suite writes its reference screenshots under `/tmp/pinwish-trip-*.png`. Preserve the baseline copies before running the same suite on the changed source. Screenshots are local artifacts, not customer data or repository dependencies.
