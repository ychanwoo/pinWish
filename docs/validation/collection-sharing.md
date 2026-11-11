# Collection sharing validation

Local checks on November 11, 2026:

- Lint, TypeScript and production build passed. Existing MapLibre bundle-size warning remains.
- 103 unit tests passed, including strict public-field allowlists, ownership, expiration, replay/concurrent creation, collection rename/move/delete, pagination and photo revocation during a download.
- 33 cloud browser tests passed, including desktop/mobile sharing, explicit create/revoke confirmation, private-window-style anonymous requests, invalid/empty links, clipboard denial and a 320 × 568 viewport.
- 4 map browser tests passed, including real MapLibre fixture layers for anonymous shared places, place selection and clearing the map after revocation.
- 12 direct-search browser tests passed after the final entry-point change.

Browser tests use fixtures; these do not constitute real AWS verification. Live
API/S3 results are recorded separately by `validate-sharing-live.mjs`.

Visual review: desktop and mobile owner dialog, read-only detail, narrow-screen
overflow, and desktop map/detail layout. Shared pages intentionally expose no
edit, note, bookmark, visited-state or account controls.

## Deployment ordering correction

The first deployment attempted to attach route-specific throttles before the new
API routes existed. `Stage.DependsOn` now names both shared routes, and regression
coverage verifies that dependency and that only the two GET routes are anonymous.

Rolling that attempt back also encountered DynamoDB's TTL reconfiguration interval.
The existing place data is retained. Do not delete or replace the Places table to
recover a settings rollback. The corrected template retains the enabled TTL setting
and the new route dependencies. CloudFormation recovery completed successfully, followed by an `UPDATE_COMPLETE`
deployment of the corrected template. No table was deleted or replaced; the
temporary recovery resource policy was removed.

AWS reference: [Continue rolling back an update](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-continueupdaterollback.html).

## Deployed verification

The corrected backend and Amplify web deployment completed. The live validation
script verified ownership, anonymous field filtering, cached private S3 photo
delivery, revocation, replacement links, and collection deletion against AWS.
A fresh anonymous browser also opened the deployed desktop/mobile shared page.
The fixture photo is deliberately a plain synthetic image, not a real venue photo.

Temporary test accounts, records, share lookups and S3 fixtures were removed.
The runtime was paused after testing; sharing requires an active test session.
See `collection-sharing-live.json` for the latest run and cleanup outcome.
