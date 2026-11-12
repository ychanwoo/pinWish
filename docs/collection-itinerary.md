# Collection itineraries

## User flow

Desktop: collection overflow menu → **Plan a trip**. Mobile: **Manage collection** → **Plan a trip**.

1. Select 3–20 places. Unvisited places are preselected, up to 20.
2. Review fresh opening hours and time zone, choose a travel date, driving/walking, daily activity window, and a preferred trip length (automatically extended when needed).
3. Review each estimated visit length (15–600 minutes). Category defaults are editable estimates, not verified venue visit recommendations.
4. Missing or unsupported opening-hour rules allow provisional scheduling within the activity window, visibly marked as unverified. Users can optionally enter checked hours. Unknown does not mean open all day.
5. Generate a proposed itinerary, adjust order/durations/settings, and regenerate before saving.
6. Saved itineraries can be reopened, edited, deleted, or shared read-only. Sharing links expire after 30 days and can be revoked.

The interface uses the existing PinWish colors, plain forms, subtle separators and a timestamped timeline. Busy requests lock dependent controls; validation errors preserve input. The planner is a focus-trapped dialog with mobile full-screen layout.

## Scheduling rules and limits

- A bounded beam search compares up to 32 candidate schedules per depth. It prioritizes fitting selected visit time, then stop count and earlier finishing, within each day. It is a practical heuristic, not a claim of globally optimal routing or the minimum possible trip length.
- The first scheduling pass fits full visits inside the preferred daily window and known opening intervals. Missing hours use the activity window with an explicit unverified-hours notice; this is not a claim that the venue is open. Durations are never silently shortened.
- Provider weekday recurrence and overnight carryover are supported. Unsupported recurrence or multiple ambiguous departmental schedules become **Hours unverified**.
- Time zone must be known and the same across all selected places. Date-to-UTC conversion uses IANA zones and daylight-saving rules.
- Lunch is reserved from 12:00–13:00. Ten minutes between stops is reserved for arrival/parking. Dedicated fallback visits can use a different lunch break.
- Driving/walking estimates use the actual road/path route matrix at the first trip departure, plus a 20% allowance. Later-day traffic is not separately forecast. Unreachable routes are represented as null and clearly marked for separate transport arrangements; no straight-line durations are substituted.
- The first day starts at its first venue. Subsequent days start route measurement from the previous day's final venue. Accommodation, airport transfers, flights, reservations, last admission and holiday closures are not inferred.
- Complete recommended plans compare daily stop limits to reduce uneven visiting/travel loads without dropping stops or adding days. Trailing empty days are removed; necessary gaps for known closure dates remain.
- Recommended days/nights count calendar days from the selected start; nights are days minus one, not booked lodging.
- Preferred dates are extended (a 28-day normal scheduling pass, followed by dedicated days where necessary). Every selected place appears exactly once. Dedicated visits search the next seven weekdays for a full opening window, even outside preferred daily hours. If no verified window accommodates the full duration, the visit remains a clearly labeled suggested time with a confirmation note. These recommendations can be saved; complete means all selections are included, not that access or transport is guaranteed.
- No OpenAI key is needed. This version uses deterministic scheduling with AWS provider data, not generated opening hours or invented AI travel times.

## AWS and API

The existing Cognito-protected Lambda/DynamoDB stack owns itinerary contexts, previews, saved trips and share records. Owner records use the user's existing partition with separate `TRIPCTX#`, `TRIPMATRIX#`, `TRIPPREVIEW#` and `TRIP#` prefixes.

- `POST /collections/{id}/itineraries/prepare`: validate ownership/membership and retrieve GetPlace `Contact` and `TimeZone` features using `IntendedUse: Storage`.
- `POST /itineraries/preview`: validate settings and stored context, retrieve/reuse a route matrix, compute the plan, and save a short-lived preview.
- `POST /itineraries`: save the server-generated preview using an idempotent client ID and version checks for edits.
- `GET /itineraries?collectionId=...`, `GET /itineraries/{id}`, `DELETE /itineraries/{id}`.
- `POST /itineraries/{id}/sharing`, `DELETE /itineraries/{id}/sharing`.
- Anonymous `GET /trip-shares/{token}` returns only name, schedule, time zone and timestamps. No account IDs, notes, provider IDs, source evidence or photo keys.

Contexts, matrices and previews expire after one hour; expiration is checked in application code independently of TTL cleanup. Save never accepts a client-authored schedule. Version conditions reject concurrent lost updates.

A saved itinerary is an explicit snapshot. Editing refreshes place details; changes to saved places alone do not silently rewrite shared plans. Deleting its collection makes the itinerary inaccessible and blocks shares. Its snapshot remains retained in DynamoDB until account/project cleanup. Deleting the itinerary itself removes the record and invalidates its token.

## Usage controls

- At most 20 detail lookups per prepare and 400 origin/destination pairs per uncached matrix.
- Paid preparation/matrix requests limited to six per user per hour and 50 globally per UTC day. A provider preparation cache miss and a new matrix each count once. Reopening the same ordered set of places in a collection reuses the owner-scoped preparation context for one hour, including its matrix cache. Current ownership and collection membership are checked before every cache hit; changes to provider identity, coordinates, name or address invalidate the lookup. The hourly bucket resets at the next UTC hour; the global daily bucket resets at 00:00 UTC. Hourly and daily limit errors have separate messages. Limits are atomic and fail closed.
- Duration/order edits reuse the matrix for the same selected place set, mode and departure. Date, mode, departure or selection changes may request another matrix.
- Shared reads never call place/routing providers. Anonymous endpoint throttled to 2 requests/second, burst 5.
- Runtime is paused between explicit test sessions. Retained storage/hosting may still incur charges; these limits are not a zero-cost guarantee.
- AWS matrix billing counts origin × destination routes, not one flat-price API call. Stored Places and core driving/walking routing pricing apply; consult current AWS prices before increasing limits.

References: [GetPlace](https://docs.aws.amazon.com/location/latest/APIReference/API_geoplaces_GetPlace.html), [opening-hour components](https://docs.aws.amazon.com/location/latest/APIReference/API_geoplaces_OpeningHoursComponents.html), [route matrix](https://docs.aws.amazon.com/location/latest/APIReference/API_CalculateRouteMatrix.html), [routing prices](https://docs.aws.amazon.com/location/latest/developerguide/routes-pricing.html), [Places pricing](https://docs.aws.amazon.com/location/latest/developerguide/places-pricing.html).

## Verification

Local checks use mocked providers and do not call paid services. For a bounded live run, explicitly opt in:

```sh
PINWISH_RUN_LIVE_ITINERARY_TESTS=1 node scripts/cloud/probe-itinerary.mjs
PINWISH_RUN_LIVE_ITINERARY_TESTS=1 PINWISH_ITINERARY_BROWSER_URL=https://demo.d297h6ubgr1uhw.amplifyapp.com node scripts/cloud/validate-itinerary-live.mjs
```

The probe uses public LA search results and writes a temporary provider response to `/tmp`. The live run creates temporary users and saved records, validates actual hours/routes, persistence, sharing and revocation, then pauses runtime and cleans up. No actual customer account is modified. See `docs/validation/collection-itinerary-live.json` for results.
