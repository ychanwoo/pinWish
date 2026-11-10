# Authenticated place storage

The reproducible CloudFormation template is generated from `scripts/cloud/build-template.mjs` and `backend/storage.cjs`.

## Resources

- Cognito Lite user pool and public app client (no client secret), email verification, password recovery.
- HTTP API with Cognito JWT authorizer on all five routes. Lambda additionally requires `token_use=access`.
- One Node.js 22 Lambda using the runtime AWS SDK, and a seven-day CloudWatch log group.
- One encrypted, on-demand DynamoDB table; Lambda can only get, query, put and delete items in this table.
- No VPC, NAT gateway, load balancer, always-on compute, or place index.

## Deploy

Use the project's AWS credentials/profile and Node 22.14+. Commands must run from the repository root.

```sh
npm run infra:build
aws cloudformation validate-template --template-body file://infra/generated/storage.json --region us-east-1
aws cloudformation deploy --template-file infra/generated/storage.json --stack-name pinwish-storage-dev --capabilities CAPABILITY_IAM --region us-east-1 --no-fail-on-empty-changeset
npm run cloud:configure
```

`cloud:configure` writes only public region/client/API identifiers and the import feature flag to ignored `.env.local`, preserving unrelated settings. Restart Vite after changing it. Never add AWS credentials to a `VITE_` variable. `AWS_REGION` controls the configure script; the template supports deployment regions generally, while this project is verified in us-east-1.

Local CORS allows localhost:5173, 127.0.0.1:5173 and 127.0.0.1:5175. Pass `AllowedOrigins` to the stack to add an exact HTTPS frontend origin for a later deployment. There is no wildcard origin or unauthenticated storage route. The frontend and Instagram/Bedrock/search development API are still local; they were not deployed in this branch.

API default throttling is 2 requests/second, burst 5. The UI spaces batch saves and makes up to two bounded retries for HTTP 429 responses. This is not a spending cap. The existing account budget alerts should remain enabled. Cognito default email delivery has low-volume limits; configure an appropriate SES identity and delivery setup before broader use. Password-reset and confirmation messages use Cognito delivery; this branch did not alter account email identities.

## Data contract

Partition key: `USER#<JWT sub>`. Sort key: `PLACE#<SHA256(provider:placeId)>`.

- `POST /places`: `{place: ConfirmedPlace, note, collection}`. Stores a schema-validated user-confirmed place. This is not a new server geocoding/identity verification step; upstream search is responsible for place lookup. Server derives owner and IDs, not the request body.
- Same owner + provider ID means one saved place, regardless of collection. Additional original post/slide combinations merge into `sources`; repeated identical submissions are idempotent. Existing note, collection and other user edits are preserved. Different provider IDs for the same physical venue are not automatically merged.
- Source key hashes canonical Instagram URL plus unique sorted slide numbers. Retains original URL, source spelling, correction, evidence and slide references. Maximum 30 source entries per place; source deletion is not included in this branch.
- `GET /places?limit=20&cursor=...`: at most 50 rows, consistent reads, opaque cursor scoped to the authenticated owner. Key-order pagination, not global date sorting. The UI's search/filter/counts apply to loaded pages; use Load more for additional records.
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
