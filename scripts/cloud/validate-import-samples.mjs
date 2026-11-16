// Optional real-provider samples, using the enclosing validator's temporary account.
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { pickNamedPlace, regionalSearchHint } from '../../src/lib/place-match.ts'

export async function validateImportSamples({ request, user, urls }) {
  if (!Array.isArray(urls) || urls.length > 3) throw Error('Use at most three sample URLs')
  const reports = []
  async function job(operation, payload) {
    const id = randomUUID()
    const accepted = await request(user.token, '/jobs', 'POST', { id, operation, payload })
    if (accepted.status !== 202) return { status: 'rejected', code: accepted.body.code }
    const deadline = Date.now() + 140000
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 1500))
      const response = await request(user.token, '/jobs/' + id)
      if (response.status !== 200) return { status: 'failed', code: response.body.code }
      if (['complete', 'failed'].includes(response.body.status)) return response.body
    }
    return { status: 'timeout' }
  }
  try {
    for (const input of urls) {
      const imported = await job('import', { input })
      const report = { input, status: imported.status, code: imported.code, candidates: [] }
      reports.push(report)
      if (imported.status !== 'complete') continue
      report.photos = imported.result.fetchedImages
      report.ignoredSlides = imported.result.result.ignoredSlides
      for (const candidate of imported.result.result.places) {
        const payload = { query: candidate.searchQuery || candidate.name, region: candidate.locationHint?.trim() || candidate.searchRegion || candidate.regionHint, countryCode: '' }
        if (!payload.region.trim()) {
          report.candidates.push({ sourceName: candidate.name, regionHint: candidate.regionHint, slides: candidate.slides, evidence: candidate.evidence, outcome: 'unresolved_region' })
          continue
        }
        let search = await job('search', payload)
        if (search.result?.queryConversion?.status === 'unavailable') search = await job('search', payload)
        const row = { sourceName: candidate.name, regionHint: candidate.regionHint, locationHint: candidate.locationHint, slides: candidate.slides, evidence: candidate.evidence, searchStatus: search.status }
        report.candidates.push(row)
        if (search.status !== 'complete') { row.code = search.code; continue }
        row.conversion = search.result.queryConversion
        const query = candidate.searchName || row.conversion?.searchQuery || candidate.name
        if (search.result.regionResolved === false) { row.outcome = 'unresolved_region'; continue }
        if (/\p{Script=Hangul}/u.test(payload.query) && row.conversion?.status !== 'translated') { row.outcome = 'unresolved_translation'; continue }
        if (!candidate.locationHint?.trim() && !candidate.locationType && query.trim().split(/\s+/).length < 2) { row.outcome = 'unresolved_ambiguous_name'; continue }
        let match = pickNamedPlace(search.result.matches, query, candidate.locationType)
        if (!match && candidate.locationHint) {
          const region = candidate.regionHint.trim() || regionalSearchHint(candidate.locationHint)
          if (region && region !== payload.region) {
            const fallback = await job('search', { query, region, countryCode: '' })
            if (fallback.status === 'complete') match = pickNamedPlace(fallback.result.matches, query, candidate.locationType)
          }
        }
        if (!match) { row.outcome = 'unresolved_match'; continue }
        const details = await job('details', { selectionToken: match.selectionToken })
        if (details.status !== 'complete') { row.outcome = 'details_failed'; row.code = details.code; continue }
        const p = details.result.place
        row.outcome = 'provider_match_requires_source_review'
        row.place = { name: p.englishName || p.name, placeType: p.placeType, address: p.address, countryCode: p.countryCode, coordinates: p.coordinates }
      }
      console.log('Sample inspected:', new URL(input).pathname, report.photos, report.candidates.length)
    }
  } finally {
    await writeFile('infra/generated/import-samples-validation.json', JSON.stringify({ checkedAt: new Date().toISOString(), method: 'Deployed jobs and runtime name-matching helper; no sample places saved. Matching is not independent ground truth.', reports }, null, 2))
  }
  return reports
}
