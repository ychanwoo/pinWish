import { processingRequest } from './processing-api'
import type { InstagramPreview } from './instagram-preview'
import {
  confirmPlace,
  isPlaceDetails,
  isPlaceSearchResponse,
  placeSearchErrors,
  type CandidateLocationDraft,
  type ConfirmedPlace,
  type PlaceMatch,
} from './place-search'
import { visiblePlaceText } from './place-name'
import { pickNamedPlace, regionalSearchHint } from './place-match'
// These aliases refer to verified provider entries for the named attractions.
const lasVegasAliases = [
  {
    names: ['high roller', 'high roller observation wheel'],
    query: 'High Roller',
    region: 'Las Vegas, Nevada',
    providerNames: ['High Roller', 'High Roller Observation Wheel'],
  },
  {
    names: ['grand canal at the venetian', 'venetian grand canal', 'grand canal shoppes'],
    query: 'Grand Canal Shoppes',
    region: 'Las Vegas, Nevada',
    providerNames: ['Grand Canal Shoppes The Venetian Resort'],
  },
  {
    names: ['seven magic mountains'],
    query: 'Seven Magic Mountains',
    region: 'Nevada',
    providerNames: ['Seven Magic Mountains'],
  },
]

function exactAttraction(matches: PlaceMatch[], names: string[]) {
  return matches.find((match) =>
    match.countryCode === 'US' && match.placeType === 'PointOfInterest' &&
    names.includes(match.englishName || match.name),
  )
}

export type AutoReviews = Record<number, CandidateLocationDraft>
export async function resolveCandidate(
  candidate: InstagramPreview['result']['places'][number],
  source: ConfirmedPlace['source']['instagram'],
  signal: AbortSignal,
): Promise<CandidateLocationDraft> {
  const target = {
    id: 'automatic',
    query: candidate.correctedName || candidate.searchQuery || candidate.name,
    region: candidate.locationHint?.trim() || candidate.searchRegion || candidate.regionHint,
    countryCode: '',
  }
  let displayQuery = visiblePlaceText(target.query, '', '')
  async function request(kind: string, body: object) {
    const response = await processingRequest(`/api/places/${kind}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
    })
    const data = await response.json()
    if (!response.ok)
      throw new Error(
        placeSearchErrors[data?.code] ??
          'Place lookup is unavailable. Try again.',
      )
    return data
  }
  try {
    // A name alone can resolve to an unrelated venue in another country.
    // Automatic imports need source geography; manual search remains available.
    if (!target.region.trim())
      throw new Error('The post does not identify a city or address. Add this place using Search places.')
    const searchInput = {
      query: target.query,
      region: target.region,
      countryCode: target.countryCode,
    }
    let results = await request('search', searchInput)
    // A transient model failure is different from an ambiguous name. Retry it
    // once; never bypass the translation/matching checks for needs_review.
    if (isPlaceSearchResponse(results) && results.queryConversion?.status === 'unavailable') {
      signal.throwIfAborted()
      results = await request('search', searchInput)
    }
    if (!isPlaceSearchResponse(results))
      throw new Error('The search response could not be verified.')
    if (results.regionResolved === false)
      throw new Error('The city or address could not be verified. This place was not added.')
    displayQuery = visiblePlaceText(
      candidate.searchName || results.queryConversion?.searchQuery || target.query,
      '',
      '',
    )
    if (/\p{Script=Hangul}/u.test(target.query) &&
      results.queryConversion?.status !== 'translated')
      throw new Error('The place name could not be matched reliably. Try again.')
    // An abbreviated one-word name without a printed address can identify an
    // unrelated business (for example a museum abbreviation versus a bar).
    if (!candidate.locationHint?.trim() && !candidate.locationType && displayQuery.trim().split(/\s+/).length < 2)
      throw new Error('This name is ambiguous without an address. Add this place using Search places.')
    // AWS supplies ranking and coordinates. OCR never supplies a pin position.
    let match = pickNamedPlace(results.matches, displayQuery, candidate.locationType)
    if (!match && candidate.locationHint) {
      const region = candidate.regionHint.trim() || regionalSearchHint(candidate.locationHint)
      if (region && region !== target.region) {
        const fallback = await request('search', { query: displayQuery || target.query, region, countryCode: target.countryCode })
        if (!isPlaceSearchResponse(fallback)) throw new Error('The search response could not be verified.')
        match = pickNamedPlace(fallback.matches, displayQuery, candidate.locationType)
      }
    }
    if (!match && /^las vegas(?:,? (?:nv|nevada))?$/i.test(target.region.trim())) {
      const alias = lasVegasAliases.find(({ names }) =>
        [displayQuery, target.query].some((name) => names.includes(name.trim().toLowerCase())),
      )
      if (alias) {
        match = exactAttraction(results.matches, alias.providerNames)
        if (!match) {
          const retry = await request('search', {
            query: alias.query, region: alias.region, countryCode: 'US',
          })
          if (isPlaceSearchResponse(retry) && retry.regionResolved === true)
            match = exactAttraction(retry.matches, alias.providerNames)
        }
      }
    }
    if (!match)
      throw new Error(
        results.unsupportedCountries.includes('KR')
          ? placeSearchErrors.unsupported_country
          : 'No location found. This place was not added.',
      )
    const details = await request('details', {
      selectionToken: match.selectionToken,
    })
    if (
      !isPlaceDetails(details) ||
      details.place.placeId !== match.placeId ||
      details.place.countryCode !== match.countryCode
    )
      throw new Error('The location changed during lookup. Try again.')
    const place = confirmPlace(details.place, {
      instagram: source,
      slides: candidate.slides,
      extractedName: candidate.name,
      correctedName: candidate.correctedName,
      evidence: candidate.locationHint ? `${candidate.evidence}\nLocation: ${candidate.locationHint}`.slice(0, 1000) : candidate.evidence,
    })
    place.displayName = visiblePlaceText(
      details.place.englishName || details.place.name,
      place.countryCode,
      displayQuery,
    )
    if (!place.displayName)
      throw new Error(
        'An English place name is unavailable. This place was not added.',
      )
    if (
      place.countryCode !== 'KR' &&
      !visiblePlaceText(place.address, place.countryCode, '')
    )
      throw new Error(
        'An English address is unavailable. This place was not added.',
      )
    return {
      targets: [
        {
          ...target,
          status: 'confirmed',
          confirmed: place,
          displayQuery: place.displayName,
        },
      ],
    }
  } catch (error) {
    if (signal.aborted) throw signal.reason
    return {
      targets: [
        {
          ...target,
          status: 'skipped',
          displayQuery,
          autoError:
            error instanceof Error &&
            !(error instanceof TypeError) &&
            !(error instanceof SyntaxError) &&
            error.name !== 'TimeoutError'
              ? error.message
              : 'Could not find this location. Try again.',
        },
      ],
    }
  }
}
