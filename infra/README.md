# AWS application infrastructure

The reproducible CloudFormation template is generated from `scripts/cloud/build-template.mjs`. See [current deployment and bounded test sessions](../docs/aws-web-deployment.md) for the full web/worker workflow. Storage contracts below remain applicable.

## Resources

- Cognito Lite user pool and public app client (no client secret), email verification, password recovery.
- HTTP API with Cognito JWT authorizer on storage and job routes. Lambda additionally requires `token_use=access`.
- Node.js 22 storage, job API, async worker and pause Lambdas; seven-day CloudWatch logs.
- Separate encrypted, on-demand places and jobs DynamoDB tables with scoped IAM permissions.
- One private encrypted S3 photo/artifact bucket, a daily cleanup rule enabled during tests, and an automatic pause schedule.
- Amplify static hosting is managed by the manual web deployment script.
- No VPC, NAT gateway, load balancer, always-on compute, or place index.

## Deploy

Use the project's AWS credentials/profile and Node 22.14+. Commands must run from the repository root.

```sh
npm run deploy:backend  # updates the existing development stack and pauses it
npm run deploy:web
npm run cloud:configure
```

`cloud:configure` writes only public region/client/API identifiers and the import feature flag to ignored `.env.local`, preserving unrelated settings. Restart Vite after changing it. Never add AWS credentials to a `VITE_` variable. `AWS_REGION` controls the configure script; the template supports deployment regions generally, while this project is verified in us-east-1.

Local CORS allows localhost:5173, 127.0.0.1:5173 and 127.0.0.1:5175. Pass `AllowedOrigins` to the stack to add an exact HTTPS frontend origin for a later deployment. There is no wildcard origin or unauthenticated storage route. The Amplify origin is included in deployed CORS and map restrictions. Instagram/Bedrock/search run through authenticated async jobs.

API default throttling is 5 requests/second, burst 10. The UI spaces batch saves and makes up to two bounded retries for HTTP 429 responses. This is not a spending cap. The existing account budget alerts should remain enabled. Cognito default email delivery has low-volume limits; configure an appropriate SES identity and delivery setup before broader use. Password-reset and confirmation messages use Cognito delivery; this branch did not alter account email identities.

## Data contract

Partition key: `USER#<JWT sub>`. Sort key: `PLACE#<SHA256(provider:placeId)>`.

- `POST /places`: `{place: ConfirmedPlace, note, collection}`. Stores a schema-validated provider-matched place. This is not a new server geocoding/identity verification step; upstream search is responsible for place lookup. Server derives owner and IDs, not the request body.
- Same owner + provider ID means one saved place, regardless of collection. Additional original post/slide combinations merge into `sources`; repeated identical submissions are idempotent. Existing note, collection and other user edits are preserved. Different provider IDs for the same physical venue are not automatically merged.
- Source key hashes canonical Instagram URL plus unique sorted slide numbers. Retains original URL, source spelling, correction, evidence and slide references. Maximum 30 source entries per place; source deletion is not included in this branch.
- `GET /places?limit=20&cursor=...`: at most 50 rows, consistent reads, opaque cursor scoped to the authenticated owner. Key-order pagination, not global date sorting. The UI loads all pages before publishing the list/map snapshot so filters and counts cover all saved records.
- `GET /places/{id}` returns one owned record, otherwise 404.
- `PATCH /places/{id}`: `{version, note?, collection?, visited?, bookmarked?}`. No owner, provider, coordinates or source mutations. Conditional writes prevent stale overwrites; conflict returns 409, requiring refresh and retry.
- `DELETE /places/{id}`: `{version}`. Explicit UI confirmation and conditional deletion. Deleting a place removes its source references.
- 24 KiB request limit, note 1,000 characters, collection 60, supported country/coordinate checks. No arbitrary external URLs in source links.

Multi-place saving is sequential with per-record atomicity, not one all-or-nothing transaction. Successful records remain saved if another fails. Retry resubmits safely; already saved records are not duplicated. A new empty collection is still a UI draft; collection names persist through saved places rather than a separate collection table.

## Sessions

Access and ID tokens expire after five minutes. Refresh tokens expire after seven days. The API receives access tokens and derives ownership from verified claims. The browser's decoded token claims are used only for UI identity, not authorization.

Unchecked “Keep me signed in for 7 days” uses sessionStorage (tab session). Checked uses localStorage with an absolute seven-day deadline; refreshing access tokens does not extend that deadline. Reload/reopen and expiration are tested with synthetic browser sessions. Browser session-restore behavior can restore sessionStorage; this option is not a promise to sign out on every browser restart.

Sign-out clears local session data immediately and requests Cognito global sign-out. API Gateway validates JWT signatures and expiry, not Cognito's token revocation list: an already issued access token can remain acceptable for its remaining lifetime (up to five minutes). A production hard-revocation requirement would need an additional authorization check. Tokens are browser-readable; do not introduce unsafe HTML or untrusted scripts. No tokens/passwords are logged or committed.

## Validation

```sh
npm run test:unit
npm run test:cloud-ui
npm run test:import-ui
npm run test:e2e
npm run check
PINWISH_RUN_LIVE_STORAGE_TESTS=1 node scripts/cloud/validate-live.mjs
```

The explicit live script provisions two temporary verified test accounts with email messages suppressed, tests the deployed API, deletes test records and removes those accounts. It uses real AWS calls. It does not verify mail delivery or the real email-confirmation/reset-code exchange; browser tests cover these UI contracts using fixtures.

## Cleanup after the project

First export any data you intend to keep. Record the TableName and UserPoolId stack outputs **before** deleting the stack:

```sh
aws cloudformation describe-stacks --stack-name pinwish-storage-dev --region us-east-1 --query 'Stacks[0].Outputs'
aws cloudformation delete-stack --stack-name pinwish-storage-dev --region us-east-1
```

The table and user pool use `Retain` to prevent accidental loss during stack changes. Deleting the stack removes its API/Lambda/role/logs/app client, but does not remove the retained table or user pool. After deliberately confirming that data/accounts are no longer needed, delete those two resources using their recorded identifiers in the AWS console (or DynamoDB delete-table / Cognito delete-user-pool). Do not recreate the same stack expecting automatic adoption of retained resources. No cleanup deletion of this deployed development stack was performed during implementation.

### Interactive map

The template also creates an Amazon Location Maps V2 API key, restricted to
`geo-maps:GetTile` on the regional default provider. Style, glyph and sprite
endpoints accompany map rendering; do not add their operation names as unsupported
API-key permission entries. There is no V1 Map resource or place index to provision.

`MapReferers` defaults to `http://localhost:5173/*` and
`http://127.0.0.1:5173/*`. Add the exact HTTPS frontend origin when deploying;
other local ports are not enabled. `MapKeyExpiry` defaults to January 1, 2027 UTC,
after the class demo. Renew deliberately if keeping the service running.
`npm run cloud:configure` retrieves the key directly into ignored `.env.local`;
it never prints the key. The key is public in browser requests, not an AWS secret.
Referrer restrictions limit browser use, but are not user authentication or a
hard cost cap. Private saved records continue to require Cognito authentication.

Map tiles are usage-billed. Keep the existing AWS budget alert enabled, avoid
unattended map reloads, and remove the map key after the demo. A recently used key
may require explicit `ForceDelete` during teardown; review that action before
using it. No Places/Routes/storage permissions are granted to this key.

Documentation: https://docs.aws.amazon.com/location/latest/developerguide/using-apikeys.html

### Automatic representative photos

Place saves enqueue asynchronous self-invocations of the storage Lambda. IAM
allows invoking only that same function. Jobs use an owner/place key and a
conditional job lease; clients cannot submit worker events through the HTTP API.
The worker matches both names and coordinates, downloads only HTTPS images from
Wikimedia's exact approved hosts (no redirects), limits response bytes, decodes at
most 2.6 megapixels and re-encodes pixels to discard EXIF/GPS metadata. It preserves
source, author and license metadata and displays attribution in the UI.

`GET /places/{id}/photo` is the only photo route. It requires a Cognito access
token and an owner-scoped record. It returns pending/not_found/unavailable or a
ready JPEG plus the updated place. Missing photos on old records are queued on
this request. No upload or photo-delete endpoints exist. Responses are no-store;
browser Blob URLs are revoked on unmount. Photo errors do not undo place saves.

The encrypted S3 bucket has public access blocked, ACLs disabled and HTTPS-only
access. Lambda can read/write/delete only `photos/*` and list only that prefix.
Objects use random keys under `photos/<owner>/<place>/`. Worker completion merges
against the latest place version so concurrent note edits are preserved. Deleted
places are never recreated by late jobs. Place deletion also deletes the photo.
Daily EventBridge cleanup removes unreferenced objects older than 24 hours;
uncertain writes are reconciled instead of deleting potentially attached photos.
The full-prefix daily scan is suitable for this small project; revisit pagination
and execution time before scaling. Lambda memory is 512 MB and timeout 60 seconds.

`npm run infra:build` bundles the handlers, discovery and JPEG codec with esbuild;
AWS SDK clients use the Node.js 22 Lambda runtime. The template is compact JSON to
stay within CloudFormation's direct-body limit. Both table and bucket use Retain:
record their output names and explicitly remove resources after the final demo.
Deleting the stack alone does not delete retained photos.

Wikimedia API requests need no API key. Coverage is not equivalent to Google
Places Photos. Do not promise a photo for every business. Negative results retry
after one day, transient failures after five minutes, pending leases after two
minutes. No provider access failure is reported as a successful photo lookup.

### Collection catalog

The storage Lambda also serves authenticated `GET/POST /collections` and
`PATCH/DELETE /collections/{id}`. It stores a versioned per-user catalog in the
existing Places table; no new table or always-on service is required. The IAM role
adds `dynamodb:ConditionCheckItem` for transactional place writes. See
[the collection design and migration notes](../docs/persistent-collections.md).
