# Repository and AWS cleanup — November 12, 2026

Scope: `chore/code-and-aws-cleanup`, issue #33. This is a maintenance change; application behavior, visual design, account data, saved places, collections, journeys, photos, and sharing links are preserved.

## Removed or simplified

| Item | Evidence and outcome |
| --- | --- |
| `src/components/PlaceConfirmation.tsx` | No imports or references from the application. Superseded by the automatic import flow; removed the unused component and its 11 exclusive CSS rules. Shared place-search types, validation, and automatic-resolution code remain. |
| 16 unused Figma SVG assets | No references in tracked source, tests, styles, scripts, or documentation outside the asset manifest and icon-size registry. Removed the assets and their unused registry/manifest entries. All remaining manifest paths and icon names resolve. |
| Map feature function's unused metadata argument | Collection colors no longer depend on geographic metadata. Removed the unused argument/type import and updated all callers and unit tests. Effect dependencies and map behavior remain unchanged. |
| Obsolete test interactions | The preview test still targeted the pre-loading-overlay “Stop searching” button. It now uses the existing overlay's Cancel button. The import test now verifies the existing non-dismissible automatic lookup, then closes/reopens after completion. No application behavior was changed to make these tests pass. |
| Duplicate processing deployment ZIPs | Inspected all 21 project deployment ZIPs by hashing their decompressed `index.js`. They contained five distinct code versions. Removed 14 redundant archives (3,061,842 bytes); retained seven, including the active archive, the newest three archives, and at least one copy of every distinct code version. |
| Non-reproducible ZIP metadata | The packaging script now normalizes ZIP entry timestamps, permissions, timezone, and extra metadata. Two builds with the same source/toolchain produced byte-identical ZIPs. Decompressed code is byte-identical to the active AWS processing artifact. No runtime code or deployment configuration changed. |

Removed SVG IDs: `177c8`, `32637`, `408b2`, `4ee98`, `4fe93`, `51444`, `570c7`, `7a475`, `9a74c`, `a10a3`, `a7250`, `bb36a`, `d8765`, `da248`, `e0689`, `f703a`.

## AWS audit and retained resources

Audit scope is this project's `pinwish-storage-dev` stack and `pinwish-web` app in `us-east-1`, with project-name inventory checks for related functions, log groups, APIs, tables, and Location keys. This is not an account-wide, all-region audit.

- One active CloudFormation stack and one Amplify app; all four project Lambda functions and log groups correspond to current stack resources. No unrelated or orphan project functions were found in the inspected region.
- Retained both DynamoDB tables, Cognito pool/client, API routes, authorizer, integrations, IAM roles, S3 bucket/policy, Location key, Amplify app, cleanup rule, and automatic pause schedule. These support current features or cost controls.
- DynamoDB TTL remains enabled on both tables. Existing cache, job, quota, and temporary records are left to their existing expiry policies; no records were manually deleted.
- All four log groups already have seven-day retention. Logs were retained for troubleshooting.
- S3's one-day incomplete multipart upload rule is unchanged. No photo, source-image, or other user-data prefix was modified. Only exact reviewed `deployments/processing-<hash>.zip` keys were deleted.
- CloudFormation deployment templates were retained for infrastructure history. Older code versions remain available under the retained equivalent keys recorded in the evidence file; historical duplicate ZIP keys themselves are no longer available.
- Before deletion, rechecked stack status, active artifact parameter, pending executable change sets, and object sizes/ETags. After deletion, verified every retained archive and the active artifact still exist and every candidate was removed.
- No infrastructure resources, users, records, policies, schedules, runtime settings, or application deployments were changed. AWS remains paused: API disabled, storage/processing/worker concurrency zero, map and hosting paused, cleanup and auto-pause schedules disabled between test sessions.

Exact archive hashes, retained equivalents, deletion results, and timestamps: [cleanup-artifacts.json](validation/cleanup-artifacts.json).

## Intentionally retained

- In-memory preview routes, mock place data, map preview imagery, and associated assets: used by local preview and UI tests.
- Instagram probe/extraction tools, provider fixtures, and live-validation scripts: used by documented debugging and validation workflows.
- Figma handoff files and historical validation reports: design provenance and project evidence.
- All declared dependencies: direct runtime, build, typing, or test references remain; none was removed speculatively.
- Ignored build/test output: generated locally and excluded from Git. These are not application source and are regenerated by validation.
- Current frontend chunks still trigger Vite's existing size warning. Bundle architecture or lazy-loading changes are deferred because this task must not change loading behavior.

## Validation

- Lint, TypeScript, and production build passed. All 134 unit tests and 100 browser tests passed: cloud UI 39, map UI 8, direct search 12, preview UI 25, import UI 13, processing UI 3. Three desktop-only tests are intentionally skipped in the mobile preview project.
- Baseline and post-cleanup desktop/mobile journey selection and result screenshots (four images) were byte-identical. The loading overlay was visually reviewed; its asynchronously loading background is not a deterministic screenshot reference.
- Asset registry and manifest paths were checked against retained files.
- Two consecutive processing builds produced identical ZIP bytes, and the extracted code matched the active AWS artifact.
- No paid application/provider tests were needed; cloud interactions were inventory reads and the reviewed duplicate-artifact removal only.
