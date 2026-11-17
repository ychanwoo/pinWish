import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readImportHistory, restoreMatches } from '../../src/lib/import-history.ts'
import type { Place } from '../../src/data/places.ts'
import type { InstagramPreview } from '../../src/lib/instagram-preview.ts'
import { parseInstagramLink } from '../../src/lib/instagram.ts'

test('deleting one location reopens only the missing candidate, while old records remain discoverable', () => {
  const url = 'https://www.instagram.com/p/Example/'
  const parsed = parseInstagramLink(url)
  assert.ok(parsed.ok)
  const candidates = ['Museum', 'Park'].map((name,i) => ({ name, regionHint: 'Los Angeles', evidence: name, slides: [i+2], needsLocationConfirmation: true as const }))
  const preview: InstagramPreview = { source: parsed.source, fetchedImages: 3, result: { places: candidates, ignoredSlides: [1] } }
  const records = candidates.map((p,i) => ({ id: String(i), saved: { placeId: String(i), displayName: p.name, sources: {
    demo: { canonicalUrl: url, extractedName: p.name, slides: p.slides, candidateCount: 2, candidateIndexes: [i] },
  } } })) as unknown as Place[]
  assert.equal(readImportHistory(records,url).complete,true)
  const remaining = readImportHistory(records.slice(1),url)
  assert.equal(remaining.complete,false)
  assert.equal(remaining.legacy,false)
  assert.deepEqual(Object.keys(restoreMatches(remaining,preview,parsed.source)), ['1'])
  delete records[0].saved!.sources.demo.candidateCount
  assert.equal(readImportHistory(records.slice(0,1),url).legacy,true)
  assert.equal(readImportHistory(records,url+'different').places.length,0)
})
