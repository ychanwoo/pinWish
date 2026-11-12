import { createRequire } from 'node:module'
import { db } from './unit/storage-fake.mjs'
import { place } from './unit/storage-fixture.mjs'
const { createHandler } = createRequire(import.meta.url)(
  '../backend/storage.cjs',
)
export async function itineraryFixture({ unknown = false } = {}) {
  const client = db(),
    places = [],
    providerCalls = { details: 0, matrix: 0 },
    state = { failRoutes: false }
  const handler = createHandler({
    client,
    table: 'test',
    itineraryOptions: {
      placesClient: {
        async send(cmd) {
          providerCalls.details++
          const p = places.find((p) => p.placeId === cmd.input.PlaceId)
          return {
            Position: [p.coordinates.longitude, p.coordinates.latitude],
            TimeZone: { Name: 'America/Los_Angeles' },
            Categories: [{ Name: 'Art Museum' }],
            OpeningHours:
              unknown && p === places[2]
                ? []
                : [
                    {
                      Display: ['Mon–Sun 09:00–18:00'],
                      Components: [
                        {
                          OpenTime: 'T090000',
                          OpenDuration: 'PT9H',
                          Recurrence: 'FREQ:DAILY',
                        },
                      ],
                    },
                  ],
          }
        },
      },
      routesClient: {
        async send(cmd) {
          providerCalls.matrix++
          if (state.failRoutes) throw Error('unavailable')
          return {
            RouteMatrix: cmd.input.Origins.map((_, i) =>
              cmd.input.Destinations.map((_, j) => ({
                Duration: i === j ? 0 : 1200,
                Distance: 5000,
              })),
            ),
          }
        },
      },
    },
  })
  const call = async (method, path, body = {}, owner = 'user-a', query = {}) =>
    handler({
      rawPath: path,
      pathParameters: { id: path.split('/')[2] },
      requestContext: {
        http: { method },
        ...(owner
          ? {
              authorizer: {
                jwt: { claims: { sub: owner, token_use: 'access' } },
              },
            }
          : {}),
      },
      body: JSON.stringify(body),
      queryStringParameters: query,
    })
  for (const [i, name] of [
    'The Broad',
    'Griffith Observatory',
    'Museum of Art',
  ].entries()) {
    const response = await call('POST', '/places', {
      place: {
        ...place,
        placeId: 'provider-' + i,
        name,
        displayName: name,
        englishName: name,
        coordinates: { longitude: -118.25 + i * 0.01, latitude: 34.05 },
      },
      note: 'PRIVATE DO NOT SHARE',
    })
    if (response.statusCode !== 201 && response.statusCode !== 200)
      throw Error(response.body)
    places.push(JSON.parse(response.body).item)
  }
  return { call, client, places, providerCalls, state }
}
