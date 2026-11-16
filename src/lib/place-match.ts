// Provider ranking breaks ties only after identity and place type agree.
export function pickNamedPlace<T extends { name: string; englishName?: string | null; placeType?: string }>(
  matches: T[], query: string, locationType?: 'place' | 'area' | 'street',
): T | undefined {
  const aliases: Record<string, string> = { dr: 'drive', rd: 'road', st: 'street', ave: 'avenue', blvd: 'boulevard', sq: 'square', brg: 'bridge', theatre: 'theater' }
  const tokens = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/['’]/g, '').split(/[^a-z0-9]+/).filter(t => t && !['the', 'and', 'of', 'at'].includes(t))
    .map(t => aliases[t] ?? t).map(t => t.length > 4 ? t.replace(/s$/, '') : t)
  const requested = [...new Set(tokens(query.split(',')[0]))]
  if (!requested.length) return undefined
  const naturalArea = requested.some(word => ['park', 'beach', 'reserve', 'forest'].includes(word))
  const streetRequest = locationType === 'street' || locationType === 'area' || requested.some(word => ['street', 'road', 'avenue', 'drive', 'boulevard', 'lane', 'way', 'square'].includes(word))
  const geographicSuffix = new Set(['state', 'national', 'regional', 'county', 'park', 'beach', 'historic', 'site'])
  const explicitCategory = requested.some(word => ['bridge', 'museum', 'station', 'observatory', 'building', 'market', 'cafe', 'restaurant'].includes(word))
  const nonIdentityWords = new Set(['under', 'near', 'entrance', 'ticket', 'tour', 'cafe', 'coffee', 'shop', 'store', 'parking', 'hotel', 'restaurant', 'bar', 'market', 'station', 'museum', 'bridge'])
  let best: T | undefined, bestScore = -1
  for (const match of matches) {
    const type = match.placeType
    if (type && type !== 'PointOfInterest' &&
        !(type === 'District' && (locationType === 'area' || naturalArea)) &&
        !(type === 'Street' && streetRequest)) continue
    const label = match.englishName || match.name
    const ordered = tokens(type === 'District' || type === 'Street' ? label.split(',')[0] : label)
    const words = new Set(ordered)
    const extras = [...words].filter(word => !requested.includes(word))
    const missing = requested.filter(word => !words.has(word))
    const exact = !extras.length && !missing.length
    // Geographic labels and roads must match the whole named area/road, not an
    // adjacent street with a shared token. A bridge park is not the bridge.
    if (type && type !== 'PointOfInterest' && !exact) continue
    if (extras.length) {
      const geographic = !explicitCategory && extras.every(word => geographicSuffix.has(word))
      const transit = requested.includes('station') && extras.every(word => ['metro', 'amtrak', 'railway', 'railroad'].includes(word))
      const properPrefix = locationType === 'place' && !missing.length && requested.length >= 2 && extras.length <= 3 &&
        ordered.slice(-requested.length).join(' ') === requested.join(' ') && extras.every(word => !nonIdentityWords.has(word))
      const spelling = words.size === requested.length && requested.length >= 3 && extras.length === 1 && missing.length === 1 &&
        extras[0][0] === missing[0][0] && !nonIdentityWords.has(extras[0]) && !nonIdentityWords.has(missing[0])
      if (!geographic && !transit && !properPrefix && !spelling) continue
    }
    const coverage = (requested.length - missing.length) / requested.length
    if (coverage < 2 / 3) continue
    const score = exact ? 100 + (type === 'District' ? 2 : 0) : coverage * 10 - extras.length * 0.1
    if (score > bestScore) { best = match; bestScore = score }
  }
  return best
}

// Remove the street/postal portion without inventing geographic context.
export function regionalSearchHint(address: string): string {
  return address.split(',').slice(1).join(',').replace(/\b([A-Z]{2})\s+\d{5}(?:-\d{4})?\b/g, '$1').trim()
}
