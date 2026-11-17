import type { Place } from '../data/places'
import type { InstagramSource } from './instagram'
import type { InstagramPreview } from './instagram-preview'
import type { CandidateLocationDraft } from './place-search'

export function readImportHistory(places: Place[], url: string) {
  const matches = places.flatMap(place => Object.values(place.saved?.sources ?? {})
    .filter(source => source.canonicalUrl === url).map(source => ({ place, source })))
  const indexes = new Set(matches.flatMap(({ source }) => source.candidateIndexes ?? []))
  const total = Math.max(0, ...matches.map(({ source }) => source.candidateCount ?? 0))
  return {
    places: [...new Map(matches.map(({ place }) => [place.id, place])).values()],
    complete: total > 0 && Array.from({ length: total }, (_, i) => i).every(i => indexes.has(i)),
    legacy: matches.length > 0 && !total,
    matches,
  }
}

export function restoreMatches(history: ReturnType<typeof readImportHistory>, preview: InstagramPreview, instagram: InstagramSource) {
  const reviews: Record<number, CandidateLocationDraft> = {}
  preview.result.places.forEach((candidate, index) => {
    const match = history.matches.find(({ source }) => source.extractedName === candidate.name &&
      candidate.slides.every(slide => source.slides.includes(slide)))
    const saved = match?.place.saved
    if (!match || !saved) return
    reviews[index] = { targets: [{
      id: 'automatic', query: candidate.name, region: candidate.regionHint, countryCode: saved.countryCode,
      status: 'confirmed', confirmed: {
        provider: 'amazon-location', placeId: saved.placeId, name: saved.name, displayName: saved.displayName,
        address: saved.address, coordinates: saved.coordinates, placeType: saved.placeType,
        countryName: saved.countryName, countryCode: saved.countryCode,
        englishName: saved.displayName, koreanName: null, retrievedAt: saved.createdAt, confirmedAt: saved.createdAt,
        source: { instagram, extractedName: candidate.name, evidence: match.source.evidence, slides: candidate.slides },
      },
    }] }
  })
  return reviews
}
