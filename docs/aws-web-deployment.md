# AWS web deployment and test sessions

PinWish is hosted at https://demo.d297h6ubgr1uhw.amplifyapp.com.
The default state is **paused**. No local API server is needed for the hosted app.
Changes in this branch have not been committed or pushed automatically.

## Start and stop a test

Run from the repository with your existing AWS CLI credentials:

```sh
npm run cloud:test:start -- 60
npm run cloud:status
# Open the hosted URL, then sign in with your own verified account.
# Finish early:
npm run cloud:test:stop
```

The duration defaults to 60 minutes and accepts 5–120 minutes. An AWS EventBridge
Scheduler one-time schedule is armed **before** runtime access is enabled.
It invokes a pause Lambda even when your terminal or laptop is closed. Scheduler
execution and AWS configuration propagation may lag the deadline; this is a
cost-reduction control, not a real-time spending guarantee. Check `cloud:status`
and Billing after testing. Starting a new window replaces the previous deadline.

Pausing disables the API Gateway execute-api endpoint, sets all three application
Lambda functions to reserved concurrency zero, disables daily photo cleanup,
restricts the map key to an unreachable test origin, and rewrites Amplify requests
to a small static paused page. Existing tabs may need a reload. Saved places,
accounts, and photos are retained. In-flight operations can finish; cancellation
in the UI stops polling, not an already-running paid analysis.

**Paused does not mean a guaranteed $0 bill.** S3/DynamoDB storage, logs, hosting
storage/transfer, authentication usage, and work already in progress may still be
billable. The existing $1 AWS budgets are notification thresholds, not hard caps.
There are no new NAT gateways, load balancers, always-on containers, or database
instances. Do not delete the stack just to pause: retained storage and account
resources have a different cleanup lifecycle.

## Deployment

The scripts use `us-east-1`, stack `pinwish-storage-dev`, and Amplify app
`pinwish-web` / branch `demo`. `AWS_REGION` and `PINWISH_STACK` override the first
two. The existing storage stack is a prerequisite; these scripts are not a fresh
account bootstrap tool. An authenticated AWS CLI with the appropriate deployment
permissions and Node.js 22.14+ are required. They never push Git commits.

```sh
npm ci
npm run check
npm run test:unit
npm run test:e2e
npm run test:cloud-ui
npm run test:import-ui
npm run test:map-ui
npm run test:processing-ui
npm run deploy:backend
npm run deploy:web
npm run cloud:test:stop
```

Backend deployment bundles processing code, uploads it to the existing private
S3 bucket under `deployments/`, and updates CloudFormation. It explicitly pauses
the runtime after deployment, including when no template changes are detected.
Web deployment builds with stack-derived public settings, uploads a fresh ZIP to
Amplify, and waits for success. It does not create GitHub auto-deploy hooks.

For a different/new Amplify app, first run web deployment to create the app, then
link its returned identifiers into the backend before testing:

```sh
PINWISH_HOSTING_APP=<app-id> PINWISH_ORIGIN=https://demo.<app-domain> npm run deploy:backend
npm run deploy:web
```

This updates exact CORS origins, map referrers, and the pause function's hosting
permissions. Never place AWS access keys, secret keys, or Cognito tokens in Vite
settings. The map key is intentionally browser-visible and restricted to map
rendering and the configured origins. Its current expiration is January 1, 2027;
renew through the stack and redeploy the frontend before then.

For local UI with the same cloud backend:

```sh
npm run cloud:configure
npm run cloud:test:start -- 60
npm run dev
```

`cloud:configure` writes ignored `.env.local`. All browser tests override the live
processing endpoint with mocks. The optional legacy `dev:api` also requires a
locally recorded active test window, rejects requests after manual stop, and
closes at the deadline. Prefer the deployed backend so its daily quotas apply.

## Architecture and boundaries

- Amplify Hosting serves the React/Vite static build over HTTPS.
- Cognito email/password accounts authorize API Gateway JWT routes.
- Existing storage Lambda owns per-user DynamoDB places and private S3 photos.
- `POST /jobs` accepts `import`, `search`, or `details`, with a client-generated
  UUID idempotency key. `GET /jobs/{id}` only returns that user's job.
- A separate asynchronous worker fetches the public carousel, invokes Bedrock,
  or searches Amazon Location. The browser polls rather than holding a request
  open across API Gateway's request timeout.
- Search selections live in DynamoDB with a 15-minute validity, bound to the
  user's partition, so a different Lambda invocation can safely retrieve them.
- Job results expire after one day; quota records after two. Application expiry
  checks do not rely on DynamoDB's delayed TTL deletion.
- Conditional transitions prevent duplicate execution. Two 135-second DynamoDB
  worker leases bound paid work; abandoned leases expire after a Lambda timeout.
  The account's low concurrency quota prevents positive reserved allocations,
  so enabled functions use the shared account pool; pause still uses zero.
- Per UTC day: 3 import attempts/user, 20 globally; 100 place requests/user,
  1,000 globally. These include failed attempts. Quotas and idempotent creation
  are written atomically. Worker duration is capped at 120 seconds, automatic
  retries are disabled, and async events expire after 120 seconds.
- Public Instagram retrieval remains experimental. A successful validation post
  is not a promise that private posts, Reels, blocked accounts, or every future
  carousel will be accessible. Failed lookups preserve the original link.

Runtime on/off intentionally changes the live API, Lambda concurrency, schedule,
map restrictions, and hosting rewrite outside CloudFormation. A later deployment
reconciles to paused mode. Do not use CloudFormation drift repair to turn on a
permanent public environment.

## Validation and rollback

Mock tests cover cloud job polling/errors and the sidebar toggle in addition to
existing authentication, storage, map, photo, and import workflows. Live validation
is explicitly opt-in because it invokes billable AWS APIs:

```sh
npm run cloud:test:start -- 30
PINWISH_RUN_LIVE_WEB_TESTS=1 node scripts/cloud/validate-web-live.mjs
npm run cloud:test:stop
```

The live script uses temporary Cognito accounts, imports the supplied LA post,
checks ten saved locations, isolation, reload, automatic photo display, sidebar
interaction and mobile overflow, then removes its own test data. It suppresses
email delivery for those temporary accounts; real signup email delivery should
also be tested manually with your own inbox. It writes a sanitized local report
to `infra/generated/web-validation.json`, never credentials. A failed run is not
reported as a completed check.

Before deploying a changed version, retain a known-good Git commit and the last
local `infra/generated/web.zip`. For rollback, make a separate worktree from the
known-good commit, install dependencies, and redeploy its compatible backend and
frontend using these scripts; pause first. Do not use `git reset --hard` on a
working tree with local changes. This branch introduces no destructive migration
of existing places or account records. Keep the backend/frontend job protocol
versions compatible when rolling either side back.

After the final demo, inventory the Amplify app, stack resources, retained
DynamoDB/S3 data, CloudWatch logs and deployment artifacts, export anything needed,
and explicitly delete disposable resources. Data deletion is a separate action
from `cloud:test:stop`.
