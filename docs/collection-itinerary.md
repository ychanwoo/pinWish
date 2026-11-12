# Collection itineraries

## User flow

Desktop: collection overflow menu → **Plan a trip**. Mobile: **Manage collection** → **Plan a trip**.

1. Select 3–20 places. Unvisited places are preselected, up to 20.
2. Review fresh opening hours and time zone, choose a travel date, driving/walking, daily activity window, and up to seven available days.
3. Review each estimated visit length (15–600 minutes). Category defaults are editable estimates, not verified venue visit recommendations.
4. Missing or unsupported opening-hour rules allow provisional scheduling within the activity window, visibly marked as unverified. Users can optionally enter checked hours. Unknown does not mean open all day.
5. Generate a proposed itinerary, adjust order/durations/settings, and regenerate before saving.
6. Saved itineraries can be reopened, edited, deleted, or shared read-only. Sharing links expire after 30 days and can be revoked.

The interface uses the existing PinWish colors, plain forms, subtle separators and a timestamped timeline. Busy requests lock dependent controls; validation errors preserve input. The planner is a focus-trapped dialog with mobile full-screen layout.

## Scheduling rules and limits

- A bounded beam search compares up to 32 candidate schedules per depth. It prioritizes fitting selected visit time, then stop count and earlier finishing, within each day. It is a practical heuristic, not a claim of globally optimal routing or the minimum possible trip length.
- Entire visits must fit the user's daily window and any known opening interval. Missing hours use the activity window with an explicit unverified-hours notice; this is not a claim that the venue is open. Durations are never silently shortened.
- Provider weekday recurrence and overnight carryover are supported. Unsupported recurrence or multiple ambiguous departmental schedules become **Hours unverified**.
- Time zone must be known and the same across all selected places. Date-to-UTC conversion uses IANA zones and daylight-saving rules.
- Lunch is reserved from 12:00–13:00. Ten minutes between stops is reserved for arrival/parking. Long visits must fit around this fixed lunch window; users can change their activity window, visit duration or trip length.
- Driving/walking estimates use the actual road/path route matrix at the first trip departure, plus a 20% allowance. Later-day traffic is not separately forecast. Unreachable routes remain unschedulable; no straight-line durations are substituted.
- The first day starts at its first venue. Subsequent days start route measurement from the previous day's final venue. Accommodation, airport transfers, flights, reservations, last admission and holiday closures are not inferred.
- Complete recommended plans compare daily stop limits to reduce uneven visiting/travel loads without dropping stops or adding days. Trailing empty days are removed; necessary gaps for known closure dates remain.
- Recommended days/nights count calendar days from the selected start; nights are days minus one, not booked lodging.
- A fixed day limit can leave places unscheduled. Saving is disabled until all selected places fit or the user changes their selection/settings.
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
- Paid preparation/matrix requests limited to six per user per hour and 50 globally per UTC day. A preparation and a new matrix each count once. Limits are atomic and fail closed.
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
