# Persistent collections

Collections belong to the signed-in Cognito user and are stored in the existing
DynamoDB Places table. Empty collections survive reload and signing in again.
No new always-on AWS service is introduced.

## User flow

- **New collection** opens a small form. Names are trimmed, Unicode-normalized,
  limited to 60 characters and unique within an account without case distinctions.
- Select a collection in the desktop sidebar or mobile collection chips. Counts,
  search results, list cards and map pins use the same selected collection.
- **Manage collection** renames the selected collection or opens a deletion
  confirmation. Deleting a collection keeps its places, notes, visited state,
  source links and cover photos in **Saved places**.
- The default **Saved places** collection cannot be renamed or deleted.
- In place detail, choose **Collection → Move**. The selected collection follows
  the moved place. Each saved place currently belongs to one collection.
- Imports save into the selected collection using its stable ID. Re-importing an
  existing provider place retains its current collection and merges source data;
  use Move to relocate it deliberately.
- Signed-out creation opens Sign in. Create the collection after signing in.
- A failed request keeps the form draft. A stale version or deleted destination
  asks the user to close the dialog, refresh places and retry with current data.

## Storage and compatibility

`USER#<Cognito sub> / COLLECTIONS` holds a versioned catalog with stable IDs,
collection versions, and migration aliases. The server derives the partition
from a validated access-token claim, never a client-supplied user ID.

On first access, the server paginates all existing `PLACE#` records and creates a
catalog from their collection names. Original rows are not rewritten. Names
that differ only in Unicode normalization/case are consolidated. Existing names
such as LA weekend remain accessible in the sidebar; Saved places is the default
selection. Empty collections previously held only in browser memory cannot be
recovered from old place records.

Place responses include `collectionId` and the current collection name. Renaming
updates the catalog. Deletion retains a tombstone; reads resolve deleted IDs to
the default. This avoids a partial bulk rewrite and preserves photo metadata and
place versions. A later place edit materializes the resolved ID/name. Recreating
a deleted collection name produces a new ID and does not reclaim old places.

Catalog updates use compare-and-swap. Place creates/updates use a DynamoDB
transaction that checks catalog version and place version together, preventing
saves into a concurrently deleted collection. GET /places includes
`collectionVersion`; the browser publishes a loaded snapshot only when all pages
match the catalog version. Concurrent catalog changes require a refresh.

Legacy clients can still submit a collection name to place POST/PATCH; the server
resolves or creates that name and writes a stable ID. Current clients always send
`collectionId`. Name-only legacy clients do not retain identity across renames.

Limits: 100 active collections, 500 catalog entries including deletion tombstones,
and a 280 KB catalog size guard. Previously existing names are preserved during
migration unless the catalog size guard is exceeded, in which case migration
returns an error without modifying place rows. These are project limits, not a
billing guarantee. Tombstone compaction needs a separate migration before raising
these limits. Multi-collection membership, shared collections, custom ordering,
and automatic cross-tab synchronization are outside this branch.

## Authenticated API

| Method / path | Request | Response |
| --- | --- | --- |
| GET /collections | — | `{ items, version }` |
| POST /collections | `{ id?: UUID, name }` | `201 { item }` |
| PATCH /collections/{id} | `{ version, name }` | `{ item }` |
| DELETE /collections/{id} | `{ version }` | `{ deleted: true, defaultCollectionId: "default" }` |
| PATCH /places/{id} | `{ version, collectionId }` | `{ item }` |

The UI generates a UUID once per create dialog and reuses it on retries, including
an ambiguous network failure after a successful write. Repeated deletion of the
same collection/version is safe. A foreign/deleted destination returns 404;
invalid input returns 400; duplicate names, stale writes, default protection and
limits return 409. Existing place route logical IDs remain unchanged in
CloudFormation; collection routes are appended and receive a separate, path-scoped Lambda invocation permission.

## Validation and local review

See the [completed validation report](validation/persistent-collections.md) for
automated checks, real AWS results and cleanup evidence.

```sh
npm run test:unit
npm run check
npm run test:cloud-ui
npm run test:map-ui
npm run test:processing-ui
npm run test:e2e
```

These checks use mocks and do not call AWS. Cloud browser tests exercise the actual
storage handler against an in-memory DynamoDB adapter, including a create response
lost after the write, reload persistence, rename/move/delete, mobile layout and
account isolation. Unit tests cover migration pagination, prototype-like names,
Unicode validation, simultaneous writes and preservation of physical place rows.

For a bounded, billable live test after backend/frontend deployment:

```sh
npm run cloud:test:start -- 60
PINWISH_RUN_LIVE_COLLECTION_TESTS=1 node scripts/cloud/validate-collections-live.mjs
npm run cloud:test:stop
npm run cloud:status
```

The live script creates two temporary Cognito users, seeds a legacy place and an
owned synthetic JPEG in their private S3 prefix, tests real API ownership and
transactions, and exercises the deployed desktop/mobile UI. It deletes only those
temporary users' rows/photos in `finally`. It does not scrape Instagram or invoke
Bedrock; photo preservation is tested with a synthetic fixture, not new photo
discovery. Results go to ignored `infra/generated/collections-validation.json`.
The bounded runtime must be stopped afterward, including on validation failure.
Stored data remains when runtime is paused, so retained storage can still incur
charges.

For manual testing: start a bounded window, run `npm run dev`, sign in, create an
empty collection and reload. Rename it, move a saved place into it, then delete the
collection and verify that the place is still in Saved places. Finish with
`npm run cloud:test:stop`. No commit or push is part of these commands.
