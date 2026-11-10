/** Names supplied by place search after the user confirms the actual location.
 * Never construct this from OCR, the caption language, or an inferred region.
 */
export interface ConfirmedLocationNames {
  countryCode: string // ISO 3166-1 alpha-2; South Korea is KR.
  koreanName?: string | null
  englishName?: string | null
}

export interface PlaceNameSource {
  sourceName: string
  correctedName?: string
  confirmedLocation?: ConfirmedLocationNames | null
}

export function getPlaceDisplayName(source: PlaceNameSource): string {
  const fallback = source.correctedName?.trim() || source.sourceName
  const location = source.confirmedLocation
  const country = location?.countryCode.trim().toUpperCase()
  if (!location || !country || !/^[A-Z]{2}$/.test(country) || country === 'ZZ') return fallback
  const localized = country === 'KR' ? location.koreanName : location.englishName
  return localized?.trim() || fallback
}
