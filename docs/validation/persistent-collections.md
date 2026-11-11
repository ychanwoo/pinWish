# Persistent collections validation

Verified November 10, 2026 (America/Los_Angeles); live result recorded at
2026-11-11T05:39:17Z. Branch: `feat/persistent-collections`.

## Automated checks

- 87 unit tests passed, including migration pagination, legacy/prototype-like
  names, Unicode/name validation, concurrent catalog updates, transactional
  deletion/save races, owner isolation and default protection.
- 21 cloud browser tests passed, including desktop/mobile collection lifecycle,
  an ambiguous create response followed by an idempotent retry, refresh and
  sign-out isolation, and stale photo-cache collection names.
- 25 demo UI tests passed; 3 desktop-only tests intentionally skipped on mobile.
- 3 map tests and 3 hosted-processing UI tests passed.
- Lint, TypeScript and production build passed. The existing MapLibre bundle-size
  warning remains; this branch does not change the map bundle strategy.

## Real AWS and deployed web

[Machine-readable result](persistent-collections-live.json) records all four live
check groups. Two temporary Cognito accounts exercised API Gateway, Lambda,
DynamoDB and S3, followed by the Amplify-hosted UI.

1. An old place row with only a collection name was migrated on read. Rename
   appeared in both place and photo responses; stale versions and foreign-account
   changes were rejected.
2. Deleting its collection left the physical place row unchanged and retained its
   S3 object, notes and original source text. Public reads resolved it to Saved
   places. The test JPEG was synthetic and owned by the temporary account.
3. Empty collections persisted. Repeated create with the same UUID returned the
   same collection; duplicate names were rejected. A real DynamoDB transaction
   moved the place and rejected another user's destination collection.
4. The deployed desktop/mobile UI created, reloaded, renamed, moved and deleted
   collections. Saved places remained after reload, sign-out cleared private
   content, and there were no uncaught browser errors or horizontal overflow.

The first live run caught a missing Lambda invocation permission for the new
`/collections` routes. A dedicated path-scoped permission was added, deployed and
verified by the successful rerun. An infrastructure regression test now checks
that permission, JWT protection, transaction permissions and existing route IDs.

All temporary accounts, DynamoDB rows and S3 fixtures from both runs were removed;
cleanup reported zero errors. Existing user data was not used as test data.
Runtime was stopped after testing: API disabled, workers reserved at zero,
map key/hosted app paused, scheduled photo cleanup and automatic-pause schedule
disabled. Retained storage is preserved and may still incur storage charges.

This branch did not rerun paid Instagram extraction or Bedrock/OCR experiments.
It verifies collection persistence and place/photo preservation; the earlier
import reports remain the evidence for real Instagram extraction accuracy.
