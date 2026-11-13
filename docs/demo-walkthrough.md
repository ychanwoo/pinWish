# PinWish demo walkthrough

Use the [release validation report](validation/aws-release.md) for what was actually checked and what remains deferred. The hosted UI and backend deploy independently; merging a PR does not deploy them.

## Before presenting

1. Confirm the intended deployment and run `npm run cloud:status` from the repository with the configured AWS CLI credentials.
2. Open only the window needed: `npm run cloud:test:start -- 30`. The automatic deadline is printed. Open the [hosted demo](https://demo.d297h6ubgr1uhw.amplifyapp.com) and reload if the paused page is cached.
3. Use a dedicated demo account and collection. Never reset another person's password or delete their places to prepare the demo. Have one previously saved demo collection/journey available in case an external provider is slow or unavailable.
4. Check network access, email access if presenting signup, and a separate private browser window for public links. Real email confirmation and password reset passed in this release review. Delivery can vary, so confirm access to the receiving inbox before demonstrating it.
5. Keep the AWS console and any credentials out of screen sharing. Do not display tokens, private source evidence or personal notes unintentionally.

## Presentation sequence

| Step | Action | What it demonstrates |
| --- | --- | --- |
| 1 | Sign in with a verified demo account. | Cognito authentication and private account storage. |
| 2 | Create a collection and paste the LA photo-post URL below. | Asynchronous Lambda jobs and Bedrock-assisted place extraction. |
| 3 | Wait for resolved places to save; inspect their map locations and original-post links. | Provider-backed coordinates and DynamoDB persistence. Unresolved results remain explicit. |
| 4 | Search directly for California State University San Marcos, select the intended result and save it. | A second intake path using the same collection/storage system. |
| 5 | Inspect a representative photo and available hours, edit a note, mark Visited and choose a collection color. Reload. | Private S3 photo caching, metadata uncertainty, persistent edits and synchronized map states. |
| 6 | Open Plan a trip, select at least three places, review dates/hours/visit lengths and generate a journey. | Deterministic planning with real travel estimates; all selected stops retained. |
| 7 | Inspect suggested-time/unknown-hours notices where present. Save, close and reopen the journey. | Honest uncertainty, persistence and editable plans. |
| 8 | Create a collection or journey sharing link and open it in a private window. Stop sharing and reload that window. | Anonymous read-only access, private-field filtering and revocation. |
| 9 | Explain the architecture and stop the test session. | AWS resource roles and deliberate cost controls. |

Validated example: [LA public photo carousel](https://www.instagram.com/p/DfFCMjzk02S/?img_index=1). This release's recorded run analyzed 12 slides and saved 10 resolved locations. That result is not a guarantee that every post or future request will succeed. Video/Reels and native mobile sharing are outside the implemented scope.

Journey durations are estimates. A suggested time is not confirmed admission or a reservation. Lodging/airport transfers, holiday closures and future traffic are not guaranteed. Photos depend on Wikimedia coverage and may be unavailable.

## Recovery during a demo

- **Slow import:** keep the progress state visible; avoid submitting the same post repeatedly. Switch to the prepared demo collection if an external service is unavailable.
- **Version conflict:** refresh places and retry the edit. Do not force an overwrite; asynchronous photo completion can also advance a record's version.
- **Lookup quota:** reuse the current journey context where possible. The per-user trip quota resets at the next hour; global limits reset at UTC midnight. Do not disable controls for the presentation.
- **Paused session:** check `npm run cloud:status`, open a bounded window if needed and reload. A paused page is not a lost-data message.
- **Email unavailable:** use an already verified demo account and disclose that live email delivery is not being demonstrated.

## After presenting

```sh
npm run cloud:test:stop
npm run cloud:status
```

Confirm paused API/map/hosting, zero application worker concurrency and disabled cleanup/automatic-pause schedules. Stop sharing any demonstration links. Remove only deliberately disposable demo records; collection deletion preserves its places in the fallback collection. Do not delete the stack or retained storage to pause it. Storage/hosting can still incur charges while runtime is paused.
