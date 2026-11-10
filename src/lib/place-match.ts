// Compare the requested venue with provider names before accepting address-based results.
// Keep provider ordering among equally named branches; the supplied address drives that order.
export function pickNamedPlace<T extends { name: string; englishName?: string | null }>(matches: T[], query: string): T | undefined {
  const tokens = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/['’]/g, '').split(/[^a-z0-9]+/).filter(t => t && !['the', 'and', 'of', 'at'].includes(t)).map(t => t.length > 4 ? t.replace(/s$/, '') : t)
  const requested = [...new Set(tokens(query))]
  if (!requested.length) return undefined
  let best: T | undefined, bestScore = 0
  for (const match of matches) {
    const words = new Set(tokens(match.englishName || match.name))
    const score = requested.filter(t => words.has(t)).length / requested.length
    if (score >= 2 / 3 && score > bestScore) { best = match; bestScore = score }
  }
  return best
}

// A precise postal code can make text search return only an address or its tenants.
// The fallback keeps the supplied city/state, without inventing geographic context.
export function regionalSearchHint(address: string): string {
  return address.split(',').slice(1).join(',').replace(/\b([A-Z]{2})\s+\d{5}(?:-\d{4})?\b/g, '$1').trim()
}
