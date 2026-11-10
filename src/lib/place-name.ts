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
  if (
    !location ||
    !country ||
    !/^[A-Z]{2}$/.test(country) ||
    country === 'ZZ'
  )
    return fallback
  const localized =
    country === 'KR' ? location.koreanName : location.englishName
  return localized?.trim() || fallback
}

/** Keep original source text in data, but never render Hangul for overseas locations. */
export function visiblePlaceText(
  text: string,
  countryCode: string,
  fallback = 'Unnamed place',
): string {
  return countryCode.toUpperCase() === 'KR' ||
    !/[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Cyrillic}\p{Script=Arabic}]/u.test(
      text,
    )
    ? text.trim() || fallback
    : fallback
}
