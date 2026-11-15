# Evidence and references

## Claims suitable for slides

| Claim | Evidence | Boundary |
| --- | --- | --- |
| Live AWS product works across the recorded core flows | [November 12 release](../validation/aws-release.md), [JSON](../validation/aws-release.json) | 14 combined checkpoints plus separate real email checks; not universal provider coverage |
| Twelve-photo carousel produced ten saved English locations | [Release report](../validation/aws-release.md) | One recorded public sample; not an extraction accuracy percentage |
| Existing user data survived validation | [Release report](../validation/aws-release.md) | Recorded fingerprints: 11 persistent records, one pre-existing account and nine photos unchanged |
| Local regression coverage after modularization | [November 13 refactor](../validation/code-refactor.md) | 140 unit / 106 browser passes, three intentional skips; fixture tests are not live AWS tests |
| Smaller initial production entry | [Refactor measurements](../validation/code-refactor.json) | 526.77 → 351.16 kB; gzip 159.83 → 107.12 kB; deferred assets remain |
| Less redundant map work | [Refactor report](../validation/code-refactor.md) | Six sidebar toggles: 12 → 0 instrumented worker messages; not an FPS benchmark |
| Layout preservation | [Refactor report](../validation/code-refactor.md) | Seven identical screenshots, one single-pixel focus-outline difference |
| Twenty-stop routing boundary handled | [Release report](../validation/aws-release.md) | Four requests / 400 route pairs with real routing and synthetic hours; not twenty real venue-hours checks |

The November 12 deployment had 105 browser passes. The additional map regression made the November 13 local total 106. Do not combine the counts into a larger number or describe the refactor as deployed based on local tests.

## Engineering explanations backed by source

- [Job worker](../../backend/processing.mjs): asynchronous jobs and ownership/expiry handling.
- [Image extraction](../../scripts/instagram/extract-places.mjs): slide references, source preservation, structured validation and bounded model requests.
- [Scheduling](../../backend/itinerary-planner.cjs) and [provider integration](../../backend/itineraries.cjs): distinguish deterministic scheduling from AI extraction.
- [Collection sharing](../../backend/sharing.cjs): public read boundary and field filtering.
- [Photo discovery](../../backend/photo-discovery.cjs): Wikimedia candidates and licensing filters.
- [Infrastructure builder](../../scripts/cloud/build-template.mjs): service permissions, authorization and resources.
- [Module architecture](../code-architecture.md): current feature/component boundaries.

## Cost statements

Use the implemented controls as the cost-management evidence: bounded sessions, automatic pause, cached requests, quotas, limited matrix size and retained-data awareness. [Deployment documentation](../aws-web-deployment.md) explains the exact controls.

There is no new Billing/Cost Explorer inspection in this documentation task. Do not turn a previously observed dollar amount into a current bill, claim remaining free credits, or promise zero cost while paused. Historical [routing pricing notes](../validation/itinerary-pricing.json) are dated evidence, not a current quote. Any price slide requires a fresh dated billing/pricing review.

## Command references

Run from the repository root with Node.js 22.14+ and locked dependencies installed. These are development/evidence references, not a demo sequence or a requirement to run paid services.

| Command | Effect | Validation in this documentation task |
| --- | --- | --- |
| `npm ci` | Installs lockfile dependencies | Definition/prerequisites reviewed; not rerun |
| `npm run dev` | Starts Vite; mode depends on local configuration | Script checked; not started |
| `npm run check` | Lint, TypeScript and production build | Executed locally; see result below |
| `npm run test:unit` | Local unit suite | Script/path checked; historical results above, not rerun |
| `npm run test:e2e` | Preview browser suite | Script/config checked; not rerun |
| `npm run test:import-ui` | Import browser suite | Script/config checked; not rerun |
| `npm run test:cloud-ui` | Fixture-backed cloud workflow suite | Script/config checked; not rerun |
| `npm run test:map-ui` | Map fixture suite | Script/config checked; not rerun |
| `npm run test:direct-ui` | Direct-search fixture suite | Script/config checked; not rerun |
| `npm run test:processing-ui` | Processing fixture suite | Script/config checked; not rerun |
| `npm run cloud:status` | Reads existing cloud runtime configuration/state | Script checked; not executed |
| `npm run cloud:test:start -- 15` | Opens a billable, bounded 15-minute runtime window | Argument range/control flow checked; not executed |
| `npm run cloud:test:stop` | Pauses runtime; retains data | Script/control flow checked; not executed |

Browser installation, preview-only environment overrides, port requirements and credentials are documented in [local development](../local-development.md). Deployment commands remain in [the deployment guide](../aws-web-deployment.md); they are not executed as documentation validation.

## Link and command verification — November 15, 2026

- Checked 70 relative Markdown links in this folder and the documentation index, including local heading targets; none were missing.
- Checked all 12 referenced npm script names and their explicit script/configuration paths against the repository.
- `npm run check` passed lint, TypeScript and production build. The existing MapLibre large-chunk warning remains. No unit/browser suite was rerun for this documentation-only change.
- The hosted demo URL returned HTTP 200 with the paused-session message. No authentication or application API was exercised, and no new cloud status/Billing inspection was performed.
- Documentation verification did not activate AWS, deploy or modify cloud data. Only Markdown documentation changed.

Historical reports and their timestamps remain unchanged. A reachable hosted page does not prove an active backend or matching deployment.
