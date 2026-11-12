# Historical plan: collection itineraries

> Superseded by the implemented [journey guide](collection-itinerary.md). This preserves the scope agreed before implementation; it is not the next-work list.

Agreed scope, recorded November 11, 2026. Not part of `feat/collection-sharing`.

- Add **Plan a trip** to the collection overflow menu before Edit name, with Delete separated below.
- Require at least three selected places. Explain the requirement when fewer are selected.
- Preselect unvisited places and let the user include/exclude places before planning.
- Use selected places, geographic locations, actual routing estimates, expected visit durations and daily activity hours to recommend a trip duration when there are many places.
- Show days and nights, such as **3 days · 2 nights**, and allow the user to change the duration.
- Allow visit-order and stay-duration edits, then save the itinerary to the signed-in account on AWS.
- Support read-only itinerary sharing with friends, including revocation and private-field exclusions; reuse the collection-sharing patterns without assuming that a collection share automatically exposes an itinerary.
- Do not infer accommodation bookings or check-in dates. Nights are a planning suggestion unless the user supplies lodging details.
- Verify routing-provider coverage, travel modes, pricing and opening-hours availability before promising a working schedule. Unknown opening hours must remain explicit.
- Decide multi-day implementation scope at the start of the itinerary issue; this request extends the earlier one-day-first proposal to include duration recommendations.

Suggested later branch: `feat/collection-itinerary`.
