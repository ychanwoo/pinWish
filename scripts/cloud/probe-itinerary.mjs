import {
  GeoPlacesClient,
  SearchTextCommand,
  GetPlaceCommand,
} from '@aws-sdk/client-geo-places'
import {
  GeoRoutesClient,
  CalculateRouteMatrixCommand,
} from '@aws-sdk/client-geo-routes'
import { writeFile } from 'node:fs/promises'
if (process.env.PINWISH_RUN_LIVE_ITINERARY_TESTS !== '1')
  throw Error('Explicit live itinerary test opt-in required')
const p = new GeoPlacesClient({ region: 'us-east-1', maxAttempts: 1 }),
  r = new GeoRoutesClient({ region: 'us-east-1', maxAttempts: 1 }),
  places = []
for (const query of [
  'The Broad Los Angeles',
  'Griffith Observatory Los Angeles',
  'Los Angeles County Museum of Art',
]) {
  const results = await p.send(
    new SearchTextCommand({
      QueryText: query,
      BiasPosition: [-118.25, 34.05],
      MaxResults: 1,
      IntendedUse: 'Storage',
      Language: 'en',
    }),
  )
  const d = await p.send(
    new GetPlaceCommand({
      PlaceId: results.ResultItems[0].PlaceId,
      AdditionalFeatures: ['Contact', 'TimeZone'],
      IntendedUse: 'Storage',
      Language: 'en',
    }),
  )
  places.push({
    id: d.PlaceId,
    name: d.Title,
    position: d.Position,
    hours: d.OpeningHours ?? [],
    zone: d.TimeZone,
    categories: d.Categories,
  })
}
const matrix = await r.send(
  new CalculateRouteMatrixCommand({
    Origins: places.map((p) => ({ Position: p.position })),
    Destinations: places.map((p) => ({ Position: p.position })),
    TravelMode: 'Car',
    RoutingBoundary: { Unbounded: true },
    DepartureTime: '2026-11-18T17:00:00Z',
  }),
)
await writeFile(
  '/tmp/pinwish-itinerary-probe.json',
  JSON.stringify({ places, matrix }, null, 2),
)
console.log(
  JSON.stringify(
    {
      places: places.map((p) => ({
        name: p.name,
        hours: p.hours,
        zone: p.zone,
      })),
      matrix: matrix.RouteMatrix,
    },
    null,
    2,
  ),
)
