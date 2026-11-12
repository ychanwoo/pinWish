# Map appearance and place opening hours

## Interface

- Visited saved places use a white check, independent of collection color. The same path applies to imported and directly searched places.
- Selected pins keep a dark ring. Mixed-collection clusters use a neutral fill and a count; expand the cluster to see individual visit states and colors.
- Map colors opens a compact keyboard-accessible panel with six named colors, active-color indicators and Reset for each collection. Escape closes the panel and restores trigger focus.
- Colors are keyed by stable collection IDs, not city or address. Every place in a collection uses that collection's color, including directly added places. Renaming preserves the color; moving a place applies its destination collection's color.
- The sidebar bookmark icon matches the map pins and shows a small named-color caption. Empty collections can also have a color selected.
- Automatic colors are deterministic; the limited palette can repeat across collections. User overrides are stored per account, not in local storage. Reset restores the deterministic default.
- Changes to colors and visit states update the map source without triggering a camera refit. Coordinate/filter changes still refit; selecting another place pans to it.
- The panel lists all active collections, independent of current map filters. Private preferences are not exposed on anonymous collection links. Earlier city-color preferences are not reused: collection preferences have a separate storage key.

## Opening hours

Place details show weekly provider hours, venue time zone, fetch date and an Open/Closed label explicitly qualified as **based on listed hours**. Overnight windows and daylight-saving offsets use the venue's IANA time zone. Missing/unsupported schedules or missing time zones never produce a confirmed open status. Stale schedules are labeled accordingly, with retry available. Holidays and last admission are not inferred.

The mobile detail sheet now includes the hours section; other previously hidden mobile facts remain unchanged.

## APIs and costs

- JWT `GET /places/{id}/details`: first verify owner access, then read public provider metadata cache or retrieve `GetPlace` with `Contact`, `TimeZone`, English language and `IntendedUse: Storage`. Coordinates must agree with the saved record.
- Successful metadata is reused for 24 hours. A failed refresh retains old data with a stale indicator and backs off for five minutes. Cache rows expire through DynamoDB TTL after seven days.
- Provider refreshes have atomic limits of 60 per account/hour and 200 globally/day. Quota rows expire after two days. Concurrent requests in different Lambda instances can consume more than one quota slot for the same uncached place; the quotas still bound calls.
- The client loads details with three concurrent requests. Existing places require no resave; fresh cached results are reused across subsequent visits. Detail failures do not prevent viewing or editing saved places.
- JWT `GET/PATCH /map-preferences`: allowlisted colors, owned, active collection-ID validation, maximum 200 overrides and optimistic version checks. Conflicts reload current preferences before retry. Reads and writes are account-scoped.
- There are no new always-on services. Provider requests, DynamoDB storage/reads and Lambda invocations can still incur costs; paused runtime does not eliminate retained-storage charges.

Sources: [AWS GetPlace](https://docs.aws.amazon.com/location/latest/APIReference/API_geoplaces_GetPlace.html), [AWS time zones](https://docs.aws.amazon.com/location/latest/developerguide/places-timezone.html).

## Validation and review

- Full unit suite, cloud UI suite, direct-search UI suite and map UI suite tested. Unit coverage includes ownership, cache reuse/backoff, quota enforcement, account-scoped preferences, stale writes, fallback regions, time zones and overnight hours.
- Browser coverage includes desktop/mobile collection color persistence/reset and sidebar synchronization, Escape focus return, visited updates, weekly hours, failed saves with retry, existing map interactions and anonymous sharing.
- Actual AWS checks are recorded in `validation/map-appearance-live.json`: real region/hours/cache, two-account isolation, preferences reset and visited persistence. Temporary users/data removed, runtime paused. Public provider metadata expires automatically; its cache is not private test-account content.
- Earlier attempts required correcting a missing temporary fixture and adding the provider-required search bias; both attempts cleaned up their temporary accounts and paused runtime.
- At that validation snapshot, the backend was deployed and the latest frontend changes were local. See [release status](README.md#release-and-verification-status) for the documentation review boundary.

To review locally, open a bounded test window with `npm run cloud:test:start -- 15`, then `npm run dev`. Sign in, open Map colors, choose a collection color, reload, reset, mark an imported or directly added place Visited, and open its Operating Hours. Stop early with `npm run cloud:test:stop`.

Opt-in live API check: `PINWISH_RUN_LIVE_MAP_TESTS=1 node scripts/cloud/validate-map-appearance-live.mjs`. This creates temporary suppressed-email test users, opens a 15-minute session, performs paid provider lookups, and cleans up in a finally block.
