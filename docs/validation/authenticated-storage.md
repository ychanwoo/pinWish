# Authenticated storage validation — issue #13

## Delivered behavior

- Top-right Sign in button; separate Sign in / Create account views, no decorative icons in the account modal.
- Invalid email produces an inline red message and prevents submission. Registration passwords enforce the Cognito policy.
- Account creation opens email verification, then returns to Sign in with email retained after verification succeeds. Unverified sign-in attempts resume verification; no separate Verify email entry is shown on the login screen. Resend code and password recovery remain available.
- Optional seven-day remembered login uses persistent browser storage plus the seven-day Cognito refresh-token lifetime. Unchecked login uses tab-session storage. Refresh does not extend the absolute deadline.
- Signed-out link submission opens the account modal and preserves the original link. Authentication does not discard the current import review. Drafts from a different signed-in account are cleared.
- User-confirmed locations are saved through the deployed authenticated API; retries preserve confirmed candidates and idempotently merge sources. Existing records keep their collection and notes when new sources are added.
- Real records load in the existing list/detail UI, with source links, actual saved dates and an honest missing-photo placeholder. Notes, visits, bookmarks and explicit deletion persist. Pagination is available through Load more.
- Real places are not placed at sample-map coordinates. Cloud mode shows a labeled map placeholder until the next map integration task.

## Checks

- 56 unit tests passed, including server ownership, invalid input, idempotency with reordered DynamoDB map fields, source merging, optimistic versions, and cursor isolation.
- 12 account/storage browser tests passed: email validation, signup-to-verification-to-sign-in transition and unverified sign-in recovery, verification and recovery UI, remembered/nonremembered sessions, seven-day expiry, fresh browser context, access-token refresh, draft retention, partial-save retry, note retry, deletion and rate-limit retry.
- 12 existing import/confirmation browser tests passed.
- 24 existing desktop/mobile UI tests passed; two intentional desktop-only skips on mobile.
- Lint, TypeScript and production build passed. Desktop and mobile authentication screenshots visually reviewed.

## Real AWS validation

[Two-account API validation](storage-live.json): real Cognito authentication and refresh, API Gateway authorization, Lambda and DynamoDB create/list/read/update/delete. Account B could not read, edit or delete account A's place. Duplicate submissions, stale-write conflicts and owner-scoped pagination were verified.

[Browser integration validation](storage-browser-live.json): signed-out link entry → real Cognito sign-in → real Bedrock Korean-query conversion → real Amazon Location selection → explicit confirmation → real DynamoDB persistence → reload → note edit → sign-out/new sign-in → persistent read → explicit deletion. Only the Instagram extraction response was replayed from the previous real recorded run; no new photo extraction was claimed.

An initial real-AWS retry test exposed a source comparison defect: DynamoDB can reorder map fields. Structural comparison replaced JSON-string comparison, and the regression test plus repeated live validation passed.

Temporary live accounts were created with messages suppressed, and test records/accounts were cleaned up. Actual email delivery and real code exchange were NOT tested; verification/reset UI paths used fixtures. Complete a signup with your own mailbox to verify delivery. Automated tests simulate the seven-day clock boundary rather than waiting seven wall-clock days.

## Deployment and remaining scope

Development CloudFormation stack `pinwish-storage-dev` is deployed in us-east-1 and its public identifiers are written to ignored `.env.local`. Frontend hosting and the existing loopback import/search API are not deployed.

Live map rendering, public sharing, standalone empty-collection persistence, additional Korean place coverage and native mobile sharing remain separate tasks. Source deletion, full-text server search and global sorting across unloaded pages are not included. See [infrastructure documentation](../../infra/README.md) for API contracts, IAM, session/revocation limits, costs and cleanup, including retained table/user-pool resources.
