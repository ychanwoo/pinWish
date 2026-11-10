# Place search and confirmation — issue #11

## Scope

Local AWS-backed search and explicit confirmation after photo extraction. No database writes, live map, authentication, public deployment, native sharing, or video ingestion.

- Amazon Location V2 SearchText and GetPlace; server-side credentials, English requested, Storage intended use.
- Search uses name + region, optional country and a world bounding box, with at most five results. No sample-specific runtime substitutions or arbitrary LA bias.
- Search selection tokens expire after 15 minutes; details are fetched using the server's stored provider ID. Client-supplied coordinates/country are not accepted as provider data.
- Reject country/city centers, unsupported Korean coverage, missing details and invalid coordinates. Detect changed place identity/country between requests.
- Explicit Select then Confirm, address/country comparison, approximate street-position warning, multiple locations per heading, skip/review, provider-ID duplicate guard.
- Preserve original URL, slide evidence, extracted/corrected names and confirmed name/address/country/coordinates/timestamps. Draft survives dialog closure, not reload. Done reviewing does not save pins.
- Abort stale requests on edits/close; separate loading, empty, unsupported, timeout, access, expired-token and retry states. Errors retain user input.

## Initial AWS results (before automatic query conversion)

[Machine-readable search evidence](place-search-live.json) records live requests against the existing AWS account. English aliases in this validation script are manually supplied test refinements, not evidence of automatic conversion. See the later validation below for the implemented automatic flow.

All ten LA English refinements returned searchable results and retrievable details. This is not ten automatically verified venues. Korean queries often returned no detailed result; Santa Monica Pier and Rodeo Drive Korean queries returned unrelated businesses. Users must refine the query and compare the branch/address.

Randy's Donuts first result was a different branch (210 N Market St); the desired 805 W Manchester Blvd appeared later and under more than one provider ID. Rodeo Drive is a street, not a precise venue entrance. Union Station metadata may lack a street number. Do not infer exactness from a successful API response.

Eight Donghae candidates with KR filter were explicitly rejected as unsupported. A real unfiltered Korean café search returned the South Korea country center, which was excluded. Korean detailed location confirmation has NOT passed and requires a provider with coverage before it can be supported.

## Verification

- Unit tests: 52 passed, including backend input/origin/body validation, independent quotas, provider normalization, stale selection identity/expiry, error redaction and confirmation/source contracts.
- Import/confirmation browser tests: 12 passed, including retries, stale results, Enter key isolation, mobile multiple locations, duplicate guards, skip, Korean coverage, invalid details and draft retention.
- Existing desktop/mobile browser suite: passed (24 passed, 2 intentionally skipped desktop-only cases on mobile).
- Lint, TypeScript and production build: passed.
- Live browser verification passed (search/details HTTP 200; desktop and 390px mobile screenshots reviewed): [place-confirmation-ui-live.json](place-confirmation-ui-live.json). This replays a previously recorded real LA extraction to avoid another Bedrock charge; place search/details remain real AWS requests. It explicitly selects the Manchester Blvd branch.

## Run / permissions / operating limits

Use Node 22.14+ and the README's two-terminal commands. The existing credential chain worked; no IAM changes, account setup or deployment was performed. [Policy template](../aws/place-search-policy.json) grants only the two Places actions for the default provider in us-east-1; adjust its region if using another region. No Places index is needed for V2.

Server-only optional environment: PINWISH_PLACES_REGION (falls back to AWS_REGION, then us-east-1). Never put AWS credentials in VITE_* variables. Local API allows loopback host/origin only, JSON bodies up to 4 KiB, two concurrent place requests and 100 attempts per process, separate from the three-import cap. Place SDK timeout is 12 seconds; client timeout is 30 seconds (query model timeout 10 seconds, Places timeout 12 seconds). Restart resets quotas. Calls are billable; this is not a hard billing budget. Before public deployment add authentication, per-user authorization/rate limits, durable storage and cloud infrastructure.

To repeat the explicit billable search experiment, start the local API then run:

```sh
PINWISH_RUN_LIVE_PLACE_TESTS=1 node scripts/places/run-validation.mjs
```

## References

- [AWS coverage](https://docs.aws.amazon.com/location/latest/developerguide/data-quality.html)
- [SearchText](https://docs.aws.amazon.com/location/latest/APIReference/API_geoplaces_SearchText.html)
- [GetPlace](https://docs.aws.amazon.com/location/latest/APIReference/API_geoplaces_GetPlace.html)
- [IAM actions/resources](https://docs.aws.amazon.com/service-authorization/latest/reference/list_geo-places.html)

Next scope: choose/implement supported coverage for any required Korean destinations, then persist confirmed records with ownership in DynamoDB and render coordinates on a real map. Do not treat a confirmed local draft as a saved record.


## Automatic query conversion follow-up

Implemented server-side Bedrock query conversion with original text preservation, country/region context, bounded JSON output, no instructions from input, 15-minute context-keyed cache, cancellation and visible fallback. English queries bypass the model. Translations are search guesses, never confirmed place names or coordinates. Details still require explicit selection and confirmation.

[Real automatic validation](english-query-live.json) used all ten original LA OCR names and their original region hints. Nine produced English queries and relevant candidate results. `포인트 듑` returned needs_review and no result, as expected for the pre-existing OCR error. `무소 앤 프랭크 그릴` became the imperfect query `Muso & Frank Grill`, but AWS returned the correct `Musso & Frank Grill` spelling. Randy's Donuts and Union Station returned multiple candidates; branch/type review is still required. No manual English replacements were supplied in this run.

Tests additionally cover context-sensitive caching, English/KR bypass, malformed and uncertain model output, model outage, cancellation, translated query forwarding, UI disclosure, unchanged original text, explicit confirmation and editable fallback. Bedrock Converse API reference: https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html

Live browser follow-up: [automatic conversion UI evidence](english-query-ui-live.json). Original Korean input 랜디스 도넛 was sent unchanged; real Bedrock conversion and AWS details confirmed the selected Manchester Blvd branch. Desktop/mobile screenshots reviewed with no horizontal overflow. The photo extraction response alone was replayed from the previous real run.
