# Architecture and data flow

Use these boundaries when drawing a future architecture slide. The table describes the application implementation, not a newly inspected AWS inventory.

| Layer / service | Responsibility | Source |
| --- | --- | --- |
| React / TypeScript / Vite | Responsive client, feature views and lifecycle state | [Code architecture](../code-architecture.md) |
| Amplify Hosting | HTTPS static assets and paused-session page | [Web deployment](../aws-web-deployment.md) |
| Cognito | Email/password accounts, verification and tokens | [Infrastructure](../../infra/README.md) |
| API Gateway | JWT-authorized private endpoints; separate anonymous read routes | [Template builder](../../scripts/cloud/build-template.mjs) |
| Storage Lambda | Places, collections, metadata, journeys and sharing | [Storage entry](../../backend/storage.cjs) |
| Processing Lambda and async worker | Job acceptance, lookup/import execution and polling results | [Processing](../../backend/processing.mjs) |
| DynamoDB | Owner records, job state, share lookups, contexts, caches and quotas | [Infrastructure](../../infra/README.md) |
| Bedrock | Image-based place extraction and query conversion | [Extractor](../../scripts/instagram/extract-places.mjs) |
| Amazon Location | Place search/details, map tiles and route matrices | [Journey integration](../../backend/itineraries.cjs) |
| Private S3 | Cached representative photos and deployment artifacts | [Photos](../../backend/photos.cjs) |
| EventBridge Scheduler / rules | Bounded-session automatic pause and scheduled photo cleanup | [Runtime controls](../../scripts/cloud/runtime.mjs) |
| CloudWatch / IAM | Operational logs and service permissions | [Template builder](../../scripts/cloud/build-template.mjs) |

## Import and persistence path

1. The signed-in browser sends an import job with a client-generated idempotency key.
2. API Gateway validates the token; the processing service creates owner-scoped job/quota state.
3. An asynchronous Lambda worker retrieves the public carousel and invokes Bedrock for candidates. The client polls the job API.
4. Search/details jobs resolve candidates through Amazon Location. Search selections expire and are owner-bound.
5. The storage API persists accepted places in DynamoDB; the authenticated client refreshes list and map data.
6. Representative-photo discovery is separate and best-effort. Eligible Wikimedia images are cached privately in S3 with attribution; missing imagery does not invalidate the place.

This is a system data flow, not an ordered live-demo script. Direct search uses the lookup/selection/storage path without Instagram extraction. Do not draw a direct browser-to-private-DynamoDB or browser-to-Bedrock secret-key connection.

The source extractor defaults to `qwen.qwen3-vl-235b-a22b` and supports a model override. This identifies the code default, not a freshly verified deployed model setting. Public Instagram retrieval is not represented as an official Meta API integration.

## Planning path

The authenticated preparation endpoint validates collection membership, obtains/reuses place hours and time zones, and creates an owner-scoped context. Preview uses an AWS route matrix and the deterministic [planner](../../backend/itinerary-planner.cjs). The server stores a preview; saving accepts that server-generated preview with ownership/version checks, not a client-authored schedule.

Contexts, matrices and previews expire after one hour. Preparation and matrix cache hits still require current ownership and compatible inputs. A saved journey is a snapshot: later edits to a place do not silently rewrite a shared journey.

## Trust and sharing boundaries

- Private requests use Cognito access tokens and owner-scoped storage. UI hiding alone is not authorization.
- Public collection and journey endpoints expose allowlisted read-only fields. Personal notes, account IDs and source evidence are excluded.
- A collection share reflects current collection membership; a journey share reads its saved schedule snapshot.
- Public photo reads serve cached content without starting paid discovery. Revocation is checked on subsequent requests.
- A place's **Copy Link** remains owner-private; it is not equivalent to a public collection/journey share.
- Map credentials are intentionally browser-visible and restricted. AWS secret credentials and user tokens must never appear in slides or client environment examples.

See [collection sharing](../collection-sharing.md) and [journey contracts](../collection-itinerary.md).

## Operational design

Normal test sessions are bounded to 5–120 minutes. The pause schedule is armed before enabling access. Pause disables the execute-api endpoint, sets application Lambda concurrency to zero, restricts map access, disables scheduled photo cleanup and serves the paused hosting page. It preserves accounts, places, collections, journeys and cached photos.

A separate pause Lambda performs the shutdown. EventBridge execution/configuration propagation may lag; pausing is not instantaneous deletion or a billing guarantee. Runtime controls, deployment and eventual data/resource removal are distinct operations. The repository scripts target an existing development stack, not a turnkey fresh-account bootstrap.
