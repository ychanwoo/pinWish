export const place = {
  provider: 'amazon-location',
  placeId: 'provider-id',
  name: 'Museum',
  displayName: 'Museum',
  address: '100 Museum Road',
  countryCode: 'US',
  countryName: 'United States',
  coordinates: { longitude: -118, latitude: 34 },
  placeType: 'PointOfInterest',
  englishName: 'Museum',
  koreanName: null,
  retrievedAt: '2026-11-10T00:00:00Z',
  confirmedAt: '2026-11-10T00:01:00Z',
  source: {
    instagram: {
      originalUrl: 'https://www.instagram.com/p/Example/?img_index=2',
    },
    slides: [2],
    extractedName: '박물관',
    correctedName: 'Museum',
    evidence: '박물관',
  },
}
export const event = (method, body, owner = 'user-a', id, query) => ({
  requestContext: {
    http: { method },
    authorizer: { jwt: { claims: { sub: owner, token_use: 'access' } } },
  },
  pathParameters: id ? { id } : undefined,
  queryStringParameters: query,
  body: JSON.stringify(body ?? {}),
})
