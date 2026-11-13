# Code organization and rendering boundaries

Reviewed November 13, 2026 on `refactor/code-modularization-and-render-performance`.
This is a behavior-preserving local refactor, not an AWS deployment or a visual redesign.

## Components by feature

Use direct imports from a feature folder. Do not add an eager barrel that imports every dialog or shared page; that would undo the loading boundaries.

| Folder | Responsibility |
| --- | --- |
| `src/components/auth/` | Account bar and authentication dialog |
| `src/components/navigation/` | Desktop navigation and mobile header |
| `src/components/collections/` | Collection rows, management, sharing and public collection page |
| `src/components/places/` | Place list/card, detail, cover photo, opening hours and list states |
| `src/components/maps/` | Live map, illustrative preview and appearance controls |
| `src/components/save/` | Instagram import, automatic resolution and direct place search |
| `src/components/journeys/` | Journey planner, visit review, schedule and public journey page |
| `src/components/shared/` | Existing icons and loading feedback |

Feature-specific hooks live alongside their components:

- `useSavePlace.ts`: import lifecycle, cancellation, draft retention, mock review states and persistence feedback. `SavePlace.tsx` renders the same markup and forwards the existing public contract.
- `useDirectPlace.ts`: direct search, candidate selection, collection creation, stale-request guards and save lifecycle.
- `useItineraryPlanner.ts`: preparation, generation, storage, sharing, deletion, selection and review state. `TripVisitReview.tsx` renders an individual visit's duration, hours and order controls; `TripSchedule.tsx` remains the schedule renderer.

`PlaceCard.tsx` and `AccountBar.tsx` are presentation boundaries. They do not own server state or introduce duplicate copies of place/account data.

## Workspace and persistence

`App.tsx` remains the composition root and owner of authenticated workspace data and cross-feature transitions. It deliberately retains the mutation ordering and ownership checks instead of introducing a second global store.

- `useWorkspaceNavigation.ts` owns the active view, collection/filter selection, selected place and detail-return navigation.
- `workspace-snapshot.ts` reads the catalog and all place pages as one consistent snapshot. It preserves collection-version checks, repeated-cursor protection and the caller's generation/owner guard. Superseded results are never published.
- `session-owner.ts` contains the shared post-request ownership check used by workspace mutations.
- `useMapAppearance.ts` owns account-scoped metadata and color preferences. Collection counts are derived in one pass and memoized by the catalog/place inputs.
- `backend/shared/dynamodb.cjs` owns DynamoDB serialization, including `NULL` values for unknown journey routes. `backend/storage.cjs` retains its existing exports and route wiring. Backend feature modules, API contracts and persisted record formats are unchanged.

## Loading and rendering

Journey planning, collection sharing and public shared pages load at their existing entry points via `React.lazy`. Authentication, import, direct search and collection management dialogs remain eager so their original focus capture/restoration timing is preserved. Dialog loading uses the existing `LoadingOverlay` inside a boundary that leaves the workspace mounted. LiveMap retains its original separate loading boundary.

`cloud-auth.ts` keeps session restoration, validation, subscriptions, owner epochs and refresh coalescing. Only actual account requests load `cognito-client.ts`; the module creates one SDK client. Local sign-out still clears private session state before attempting remote revocation. No authentication behavior or token lifetime is changed.

The filtered map-place array and filtered/sorted list results are memoized by their data inputs. Opening-hours responses no longer trigger GeoJSON updates: map geometry/properties depend on the place records, selected ID and collection colors, not on hours metadata. Actual changes to visits, colors, selection, filtering and account ownership still update the map.

No blanket `memo` wrappers, custom equality shortcuts or framework changes were introduced. MapLibre remains a substantial asynchronously loaded dependency; moving its code between chunks would not reduce its actual work.

## Validation and maintenance

See [refactor verification](validation/code-refactor.md) for bundle measurements, map worker counts and visual comparisons. Use [local development](local-development.md) for the existing test commands. Tests use local fixtures; no live provider calls are needed for this refactor.

When extending a feature, keep its UI and lifecycle hook together, keep transport contracts in `src/lib/`, and retain cancellation, account-change and retry guards. Extract a shared abstraction only when behavior and ownership are actually shared.
