# PinWish documentation

Current implementation review: November 12, 2026. These guides describe the repository; deploying and opening a bounded test session are separate actions.

## Current guides

| Guide | Scope |
| --- | --- |
| [Project overview](../README.md) | Features, boundaries, AWS architecture and course context |
| [Local development](local-development.md) | Preview/cloud modes, environment configuration, tests and sample screens |
| [AWS deployment](aws-web-deployment.md) | Existing-stack prerequisites, deployment, pause/resume, rollback and costs |
| [Infrastructure](../infra/README.md) | Resource retention, sessions and storage contracts |
| [Direct place search](direct-place-search.md) | Search selection, provenance, collection choice and saving |
| [Collections](persistent-collections.md) | Persistent catalog, rename/delete/move and migration |
| [Collection sharing](collection-sharing.md) | Anonymous read-only links, revocation and privacy |
| [Journey planning](collection-itinerary.md) | Durations, hours, routes, all-stop fallback, persistence and sharing |
| [Map appearance and hours](map-appearance.md) | Collection colors, visits, metadata freshness and limits |
| [Code architecture](code-architecture.md) | Feature folders, hooks, loading boundaries and rendering responsibilities |
| [Refactor verification](validation/code-refactor.md) | Local regression, bundle and map-work measurements |
| [Cleanup audit](cleanup-audit.md) | Dated repository/AWS cleanup evidence |

## Release and verification status

The [November 12 release validation](validation/aws-release.md) records the latest compatible frontend/backend deployment, actual email verification and reset, local regression checks, and the combined live walkthrough. See that report for final results and limitations; older feature reports describe their own releases.

Backend and frontend deploy independently. A merged PR does not deploy to Amplify. The release report identifies both its base commit and the fixes validated before commit and includes deployed artifact hashes. Use `npm run cloud:status` to inspect current runtime state rather than inferring it from an old screenshot.

Use the [demo walkthrough](demo-walkthrough.md) to open a bounded test session, demonstrate the saved-place and journey flows, recover from provider failures, and pause afterward.

## Cache and request limits

| Operation | Current bound / reuse |
| --- | --- |
| Instagram jobs | 3 attempts/user/UTC day; 20 globally/UTC day, including failed attempts |
| Search/details jobs | 100/user/UTC day; 1,000 globally/UTC day |
| Journey provider work | 6 uncached operations/user/hour; 50 globally/UTC day; preparation and new route matrix each count once |
| Journey reuse | Owner-scoped preparation, matrices and previews expire after one hour; current ownership/membership checked before reuse |
| Place hours/details | Successful metadata reused for 24 hours; failed refresh backs off five minutes; 60 provider refreshes/account/hour, 200 globally/day |
| Representative photos | Cached private S3 JPEGs; missing-photo retry after one day, transient failure after five minutes, expired pending lease after two minutes |
| Public sharing | 30-day link lifetime; anonymous route throttle 2 requests/second, burst 5 |
| Test sessions | Default 60 minutes; explicit 5–120-minute window, automatic pause schedule |

Hourly quota buckets reset at the next hour; daily buckets use UTC midnight. Context expiry and quota expiry are different: waiting for a quota reset does not revive an expired preview. Changing trip date, departure, mode or selection can require new provider work. Details are in the linked feature guides and source; none of these controls guarantees a zero AWS bill.

## Documentation verification — November 12, 2026

- Checked local Markdown links and heading anchors, all 21 referenced npm script names, and explicit Node script paths against the repository; no missing targets were found.
- `npm run check` passed lint, TypeScript and production build. The existing large-bundle warning remains. Browser/unit results above are historical; those suites were not rerun for this documentation-only edit.
- AWS and Figma developer-document links and the hosted demo returned HTTP 200. The private Figma design returned HTTP 403 from the verification client; its contents/access could not be verified. A 200 response from the demo is not an application end-to-end test.
- `npm run cloud:status` reported paused hosting/map, disabled API/cleanup/automatic-pause schedule, and zero reserved concurrency for storage, processing and worker functions. This was a read-only check, not a new test session.
- Deployment/start/stop and billable live-test commands were checked against their scripts, not executed. They require credentials, an existing stack and the documented opt-in settings. No claim of a fresh-account bootstrap or a new live test is made.
- Historical Markdown report bodies and JSON evidence were preserved. Only Markdown documentation changed; no application, infrastructure configuration or design changes were made.

## Historical evidence

The files in `validation/` preserve dated experiments and live/local checks. Older statements such as “not implemented” or “not deployed” apply to that report's stage. JSON evidence is not rewritten when later functionality changes.

- [Instagram feasibility](validation/instagram-feasibility.md), [initial place confirmation](validation/place-confirmation.md), [automatic imports](validation/automatic-import.md)
- [Authentication/storage](validation/authenticated-storage.md), [interactive map](validation/interactive-map.md), [photos](validation/place-photos.md), [CSUSM photo follow-up](validation/csusm-cover-photo.md)
- [Collections](validation/persistent-collections.md), [live-data polish](validation/live-data-polish.md), [sharing](validation/collection-sharing.md), [journeys](validation/collection-itinerary.md)
- [Superseded journey plan](next-collection-itinerary.md)

## Deferred scope

Native mobile apps/share-sheet intake, Instagram video analysis, collaborative editing of shared collections, guaranteed photo coverage, detailed South Korean place lookup and in-app turn-by-turn navigation are not implemented. AI place extraction is implemented; journey scheduling itself is deterministic. Course presentation/report preparation remains separate from implementation and release validation.
