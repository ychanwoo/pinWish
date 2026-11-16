import { GeocodeCommand } from '@aws-sdk/client-geo-places'

// The provider, never the language model, supplies the search origin and bounds.
export function createSearchAreaResolver(send, now = Date.now) {
  const cache = new Map()
  return {
    async resolve(region, countryCode, signal) {
      if (!region.trim()) return null
      const key = JSON.stringify([region.toLowerCase(), countryCode])
      const prior = cache.get(key)
      if (prior?.expires > now()) return prior.area
      const response = await send(new GeocodeCommand({
        QueryText: region, MaxResults: 1, Language: 'en', IntendedUse: 'Storage',
        ...(countryCode ? { Filter: { IncludeCountries: [countryCode] } } : {}),
      }), signal)
      const place = response.ResultItems?.[0]
      const position = place?.Position
      const country = place?.Address?.Country?.Code2
      if (!Array.isArray(position) || position.length !== 2 || !position.every(Number.isFinite) ||
          Math.abs(position[0]) > 180 || Math.abs(position[1]) > 90 || !/^[A-Z]{2}$/.test(country ?? '') ||
          (countryCode && country !== countryCode)) return null
      const box = place.MapView
      const bounds = Array.isArray(box) && box.length === 4 && box.every(Number.isFinite) &&
        box[0] <= box[2] && box[1] <= box[3] && box[0] >= -180 && box[2] <= 180 && box[1] >= -90 && box[3] <= 90
        ? box : [position[0], position[1], position[0], position[1]]
      const area = { position, country, bounds }
      cache.set(key, { area, expires: now() + 15 * 60 * 1000 })
      if (cache.size > 64) cache.delete(cache.keys().next().value)
      return area
    },
    clear() { cache.clear() },
  }
}

export function isWithinSearchArea(item, area) {
  if (!area) return true
  if (item.Address?.Country?.Code2 !== area.country) return false
  const [longitude, latitude] = item.Position ?? []
  // Allow adjacent neighborhoods/venues near a city edge, not distant namesakes.
  const latPad = 25 / 111
  const lonPad = Math.min(5, 25 / (111 * Math.max(0.1, Math.cos(area.position[1] * Math.PI / 180))))
  const [west, south, east, north] = area.bounds
  return Number.isFinite(longitude) && Number.isFinite(latitude) &&
    longitude >= west - lonPad && longitude <= east + lonPad &&
    latitude >= south - latPad && latitude <= north + latPad
}
