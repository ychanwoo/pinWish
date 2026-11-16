# Instagram import accuracy follow-up — November 16, 2026

Branch: `test/post-refactor-release-validation`; base commit `49d1244565f64a2f567b295ca9d120687fdfbb73`. Includes uncommitted fixes. This follow-up supersedes the NYC accuracy outcome in [the earlier release report](post-refactor-release.md), which is retained as failed-baseline evidence.

## Source and acceptance criteria

[NYC photo carousel](https://www.instagram.com/p/DZ9PJzuj1h5/?img_index=8): 13 images, ten explicitly named destinations. A carousel index is only the initially selected image; the importer processes the entire supported carousel. Cover/end/promotional and unnamed-activity images must not produce invented venues. Multiple named destinations on one image must become separate candidates; repeated destinations retain their source references without duplicate saves.

| Slide | Actual destinations |
| --- | --- |
| 2 | Central Park; Domino Park |
| 6 | Brooklyn Bridge; Manhattan Bridge |
| 7 | Williamsburg, Brooklyn |
| 8 | Times Square |
| 10 | Broadway, theater district context |
| 12 | Museum of Modern Art; Metropolitan Museum of Art; Solomon R. Guggenheim Museum |

Slides 1, 3, 4, 5, 9, 11 and 13 contain no independently named destination to save: covers/endings or general activities, songs and food references. This is a source-specific review, not a rule to discard every first/last image. An ordinary content slide is not discarded just because it contains several places.

## Causes and corrections

- The previous vision pass mixed author captions with incidental signs. Each image is now transcribed for author-added text first, followed by a text interpretation pass using complete sentences and shared context. Background signs are not recommendations.
- Korean abbreviations lost context during independent translation. The interpreter now supplies provisional English search hints while retaining the original name, evidence and slide references. Every source name must occur in its referenced transcript. Model output never supplies trusted coordinates.
- Worldwide `name, city` searches often ranked tenants or addresses ahead of the intended attraction. Amazon Location Geocode anchors the supplied region; SearchText searches the name with that geographic bias and country filter. Distant/cross-country matches are excluded; unresolved geography cannot auto-save.
- District filtering removed named areas and Central Park. Named districts are supported, while cities/countries remain invalid saved destinations. Exact identities outrank tenants and suffix matches. A bridge is not its similarly named park. Broadway uses the source's theater-going context instead of the unrelated northern part of the long road.
- GetPlace still supplies the final provider identity, English display, address and coordinates. Provider IDs prevent duplicate saves. No sample-specific name mapping or hardcoded runtime coordinates were added; explicit sample expectations exist only in the validation script.

Districts and streets have representative provider coordinates, not guaranteed entrances. Times Square and the relevant Broadway segment have distinct provider IDs but share a crossing coordinate; the map may cluster them. The application does not fabricate offsets.

## Verification

- Fresh complete extraction: 13 images, ten correct named candidates, no extra candidates; 40.074 seconds in the recorded local provider run. This is extraction duration, not a whole-flow latency guarantee. The pipeline uses one transcription per image plus one interpretation request (14 model calls here), bounded by the existing image/byte/time limits.
- Real provider search and details: all ten identities resolved in the expected NYC neighborhoods, including Central Park/Williamsburg districts and Times Square/Broadway street results.
- Actual AWS deployment: Amplify job **22**; 13 frontend JS/CSS artifacts and four Lambda packages match the working tree. Both backend and frontend were deployed.
- Actual browser run: the existing LA ten-place import and 14 core authentication/storage/sharing/journey checks passed, followed by the NYC source check. Ten NYC records retained their original source names, slide references and evidence; English display, unique provider IDs and independently specified geographic bounds were asserted. A separate repeat also passed map-ready, ten selectable places and reload assertions. Visual review confirmed a loaded NYC street map with five individual points and clusters of three and two. Results are recorded in the [JSON companion](instagram-import-accuracy.json).
- Local checks: lint, TypeScript and production build passed. The existing MapLibre bundle-size warning remains. **157 unit tests, 77 Chromium browser tests** (20 import, 42 cloud, 12 direct, three processing) and **42 WebKit cloud browser tests** passed after these changes. Engine/viewport tests do not establish physical iPhone/Android coverage.
- Regression cases cover author-text grounding, incomplete model output, multiple names, regional filtering, missing geography, district storage, exact bridges versus parks/tenants, original-source retention and contextual English hints.

## Reproduce the focused live check

These commands incur provider usage and require the configured stack, current deployed artifacts and AWS credentials. Only disposable accounts created by the validator are modified. Its cleanup path removes those accounts/records/photos and pauses runtime; the outer stop is an additional safeguard.

```sh
npm run cloud:test:start -- 10
PINWISH_RUN_LIVE_WEB_TESTS=1 PINWISH_VERIFY_IMPORT_ACCURACY=1 PINWISH_VERIFY_IMPORT_ACCURACY_ONLY=1 node --experimental-strip-types scripts/cloud/validate-web-live.mjs
npm run cloud:test:stop
npm run cloud:status
```

Do not chain the stop command behind success-only `&&`: it must run after a failure too. Evidence is written under ignored `infra/generated/`. The committed JSON companion contains privacy-safe sample results, not login credentials or account identifiers.

## Limits and data safety

These results verify the reviewed LA/NYC samples, not 100% accuracy on every future Instagram post. OCR, interpretation and public-media retrieval remain fallible. Unnamed venues cannot be located reliably from scenery alone. Unsupported mixed-video posts, detailed South Korean lookup and physical-device coverage remain documented limitations; no unrelated behavior or visual redesign was introduced.

Existing records/accounts/photos are compared against the pre-test fingerprint baseline. Temporary data is removed, and hosting/map/API/workers are paused after verification. Retained storage can still incur charges. No commit or push was performed.

Final cleanup audit: existing **11 records, one account and nine photos unchanged**, with no added records/accounts/photos. Browser errors and cleanup errors were empty. Final runtime status: hosting/map paused, API disabled, all three worker concurrency values zero, cleanup/automatic-pause schedules disabled. HTTP 202 job acknowledgements sometimes emitted an unused-body abort after the client moved to polling; all operations completed successfully. This is recorded separately from application failures.
