# Instagram import feasibility — issue #3

> Historical validation snapshot. Results, counts, deployment statements and remaining work below describe the recorded run, not the current release. See the [current documentation index](../README.md) for implemented behavior and verification status. Original evidence is preserved.

Checked 2026-11-10 on `feat/2-instagram-link-validation`.

## Decision

The branch delivers an opt-in **experimental photo-carousel review flow**, not automatic verified map saves. Korean transcription was improved by switching the default to AWS Bedrock Qwen3-VL and analyzing at most three images per request. Original-language headings and original slide numbers are preserved. Users can open the referenced photo and correct a candidate name without changing the original OCR evidence.

The manually reviewed Donghae sample passes twice; LA still has one transcription error. Mixed video posts are explicitly unsupported. Do not describe this as a production-ready importer or universally accurate OCR. No issue was closed automatically.

## Real samples and independent comparison

All 32 returned slide images/posters were manually viewed on 2026-11-10. The independent baseline is [instagram-ground-truth.json](instagram-ground-truth.json); it is **never supplied to the extraction model or runtime**. Video review covers static posters only, not the full videos. The baseline records slide headings, not verified business addresses or coordinates.

| Source | Original content | Final Qwen result, repeated through local HTTP API | Assessment |
| --- | --- | --- | --- |
| `De1gmWjkwEd` | 10 photos: cover 1, venue headings 2–9, promotion 10 | 8/8 headings and slide references correct in both runs; cover/end excluded. 19.2 s CLI, 22.1 s HTTP. `img_index=10` still analyzes all 10 images. | Sample passes. Slide 7 names two attractions together; this combined candidate still needs disambiguation. |
| `DfFCMjzk02S` | 12 photos: cover 1, venue headings 2–11, promotion 12 | 10 candidates; 9/10 headings correct in both runs. Slide 4 says `포인트 둠`, model reads `포인트 듑`. | Strict comparison fails; needs user correction. Earlier Nova Lite output `Malibu` was also incorrect, not merely an ambiguous venue. Ten candidates alone did not prove correctness. |
| `DfLAnjLEx2G` | 10 slides: 6 photos, videos at 3/4/7/9. Eight venue/activity headings on 2–9. | HTTP 502 with `unsupported_video_slide`, before any Bedrock inference. | Explicit unsupported-media result. We do not pretend poster analysis is complete video comprehension. |

[Comparison report](instagram-ground-truth-comparison.json) records every expected and actual name. English identity aliases are accepted only for earlier English-output experiments; final Qwen results are also checked against original Korean headings. Matching ignores spacing/punctuation only, not Hangul spelling errors. The evaluator exits nonzero for LA deliberately; it is an offline quality assessment, not a passing automated accuracy test.

Earlier runs remain available: Nova Lite and Pro failed Korean quality; Nova 2 Lite still produced misspellings and a cover candidate. Claude trials did not establish usable accuracy: the first result failed structural validation and a subsequent request returned an Anthropic use-case-form prerequisite. Qwen initially exceeded the provider request-body limit with all images together; batching resolved that. No Claude access form or account setting was changed. Qwen currently works with the existing account, so Claude setup is optional for later comparisons.

Reports retain timestamps, counts, token usage and candidate text. No browser cookies, signed media URLs, raw HTML, AWS account identifiers or original photos are committed. `instagram-bedrock-donghae.json` predates the strict contradiction validator and is retained as a rejected result. `instagram-bedrock-donghae-pro.json` had a JSON parsing failure; its generic error was not proof of an AWS permission failure.

## Retrieval findings

Two unauthenticated public HTML probes returned HTTP 200 for all three posts, about 0.4–0.7 seconds each. A separate LA request with the default fetch user agent contained no carousel markers, whereas the explicitly identified diagnostic client did. HTTP success, preview metadata and marker strings are not completeness evidence. The extractor separately parses JSON script blocks, matches the exact shortcode, requires every listed item to be a photo with a URL, and downloads all listed images before inference. It does not execute page scripts, call private endpoints, import a browser login, bypass CAPTCHA, or follow redirects.

An array in an undocumented response proves only the items returned by that response, not completeness for arbitrary posts. These three samples have now been visually compared; this does not establish universal completeness. Photo counts alone do not prove extraction accuracy. The current implementation fails closed for missing/oversized content, video, invalid model JSON, unaccounted slides and contradictory ignored slides. It cannot detect every plausible hallucination.

Meta's [official Instagram Login collection](https://www.postman.com/meta/instagram/folder/1z5vxzu/instagram-api-with-instagram-login) describes professional-account management and access-token permissions. This is not evidence of unrestricted arbitrary-post retrieval. The [oEmbed documentation](https://developers.facebook.com/docs/instagram-platform/oembed/) returned 429 during this check; no oEmbed API request or carousel guarantee was verified. No Meta developer app or external data-provider account was supplied. Public HTML experiments are not a verified supported production API; access stability and permitted downstream use require separate confirmation before deployment.

## Implementation

- Shared URL validation allows only HTTPS Instagram `/p/{shortcode}` or `/reel/{shortcode}` URLs on explicit hosts. Credentials, custom ports, lookalike hosts and unrelated paths are rejected. Share redirect URLs are deliberately unsupported, not fetched. Original input is retained; canonical identity excludes tracking parameters and `img_index`; slide selection is retained separately and never limits the analysis to one image.
- Real URLs cannot trigger substring matches against demo places. The exact documented demo URL remains a UI fixture.
- Optional local HTTP API fetches public photo carousels and uses the [AWS Bedrock Converse API](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html). Browser code never imports AWS SDK credentials. Server-only SDK uses the existing AWS credential chain.
- Default model is `qwen.qwen3-vl-235b-a22b` in `us-east-1`; server override `PINWISH_BEDROCK_MODEL` permits controlled comparisons. No automatic paid retries or model fallback.
- Image/HTML limits, Meta CDN host allowlist, no redirects, 10-second fetch timeouts, 95-second total analysis deadline, 20-image/20 MB input limits, batches of at most three images / 3.5 MB raw bytes, one active local post and three post attempts per server process constrain this experiment. A post can make several billable model requests; no batch retry/fallback is automatic. If any batch fails, no partial candidates are returned.
- UI experiment shows candidate names, regions, original evidence, per-photo review links and ignored/unreadable slide references. Name corrections are labelled and retained in the session draft; the original evidence stays unchanged. Empty extraction explicitly does not mean the post contains no places. It never turns candidates into confirmed map pins. Draft and results survive closing/reopening within the page session. Cancel discards late UI results; it does not guarantee an in-flight Bedrock request is cancelled or unbilled.
- Exact duplicate normalized name/region pairs merge slide references. Different aliases, branches and ambiguous names still require review.

## Run locally

Use the repository's Node 22 environment (`nvm use`; Node 22.14+ for the test scripts), then `npm ci`.

Terminal 1:

```sh
npm run dev:api
```

Terminal 2:

```sh
VITE_ENABLE_INSTAGRAM_PREVIEW=true npm run dev
```

Open the Vite URL, choose Add pin, paste a sample URL and choose Find place. Default `npm run dev` keeps the experiment off. Existing `?state=` screens remain UI demos. The API binds only to `127.0.0.1:8787`. Stop both commands with Ctrl+C. Restarting the API resets its three-attempt session limit. Do not expose this unauthenticated development server publicly.

CLI diagnostics:

```sh
npm run probe:instagram
npm run extract:instagram -- DfFCMjzk02S
```

The extraction command makes a real, billable AWS call if retrieval succeeds. The HTML probe makes no Bedrock calls. Never put AWS secrets in `.env` client variables or Git.

## AWS and cost

The current AWS profile authenticated successfully, configured for `us-east-1`. Real Bedrock calls ran there; the HTTP API and HTML fetching ran locally, not in Lambda. No Lambda, API Gateway, Cognito, DynamoDB, S3 or hosting resources were created. `probe.mjs` also exports a dependency-free Lambda-compatible `handler`; cloud execution was not tested. Production deployment still needs authenticated endpoints, per-user quotas, least-privilege IAM, durable asynchronous jobs if runtime exceeds HTTP limits, and error/usage monitoring.

Two existing USD 1 budgets were visible. Their notification recipients and alert delivery were not verified or changed. No provisioned throughput or idle paid endpoint was created. The [AWS pricing table](https://aws.amazon.com/bedrock/pricing/) lists Qwen3 VL 235B A22B in US East at $0.53/M input and $2.66/M output tokens. The Donghae run totals 21,790 input and 487 output tokens across four requests: approximately **$0.01285 per post** at those rates. This is an estimate, not a billing statement; regional prices can change. A failed parse or later batch can still incur charges. Earlier Nova trials have their own separate token records. No idle endpoint or provisioned capacity was created.

## Validation and remaining gates

Unit tests cover link identity/security, parser matching, missing/video slides, CDN rejection, response limits, model output structure, contradictory coverage, deduplication and coordinate exclusion. Browser tests cover default UI regression plus the experimental candidate display, retained drafts, invalid API responses and video errors. Mock browser responses prove UI behavior, not retrieval or extraction accuracy. Real CLI and local API results are separately recorded.

Completed in this branch:

- Canonical URL validation and real/demo separation; all supplied photos considered regardless of `img_index`.
- Bounded AWS-backed extraction, original-language prompting, provider-size batching, strict output/slide validation and explicit error categories (including model setup, throttling and timeout).
- Independent original-slide comparison and two real photo-post runs each; mixed-video rejection tested through HTTP.
- Candidate/source review and local name corrections; empty, unsupported, malformed and retained-draft states tested.

Remaining product work / known limitations:

1. LA slide 4 OCR error remains; manual correction is available. Broader and unseen-post accuracy is unmeasured. Do not claim 100% OCR or encode sample-specific replacements.
2. Confirm a permitted, repeatable production retrieval method. Undocumented HTML availability can change; no Meta API integration was established. Private/deleted/partial-access cases are not inferred from generic failures.
3. Implement place search, address disambiguation and explicit confirmation, then persistent saves and real map pins. Compound headings such as slide 7 must be resolved into concrete locations. This is the next feature, not part of extraction completion.
4. Deploy authenticated AWS endpoints/storage/hosting and verify outbound access there. Local retrieval plus real Bedrock calls does not prove Lambda retrieval works.
5. Native incoming shares and video analysis are deferred; the web photo flow is the current scope.

Verification: 39 unit tests passed; lint/typecheck/production build passed; 24 desktop/mobile regression tests passed (2 desktop-only tests intentionally skipped on mobile); 4 experimental browser review tests passed. Desktop and mobile screenshots using the recorded real Donghae response showed no runtime errors or horizontal overflow. Browser tests use API fixtures; live AWS evidence is recorded separately. The two Playwright configurations use separate output directories to avoid trace-file collisions.

Implementation and validation were completed before the user requested grouped local commits. No pushes, new issues or issue closure were performed.

## Display-language contract

Original extracted `name` and `evidence` remain unchanged; `correctedName` is a separate user edit. `src/lib/place-name.ts` implements the confirmed-location rule: `KR` uses the Korean place name, other known countries use the English name, and missing country/localization falls back to the correction or original. The import response cannot supply confirmed-location metadata or user corrections to the review UI. This branch does not perform translation or place search; current unconfirmed candidates retain their original language. The next place-search feature must supply confirmed country and provider-localized names before this policy can switch them to English. Unit tests exercise US/KR/JP, unknown country, missing localization and preserved source text. Browser tests verify that edits retain original names and forged localized/corrected fields from the extraction response are ignored.
