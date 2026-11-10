import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isInstagramPreview } from '../../src/lib/instagram-preview.ts'
test('browser rejects null candidates, incomplete coverage, empty evidence and falsely confirmed output', () => {
  const place = { name: '한글 장소', regionHint: '', evidence: '한글 장소', slides: [2], needsLocationConfirmation: true }
  const data = (places: unknown[], ignoredSlides = [1]) => ({ fetchedImages: 2, result: { places, ignoredSlides } })
  assert.equal(isInstagramPreview(data([place])), true)
  for (const p of [null, { ...place, name: '' }, { ...place, evidence: '' }, { ...place, slides: [] }, { ...place, needsLocationConfirmation: false }]) assert.equal(isInstagramPreview(data([p])), false)
  assert.equal(isInstagramPreview(data([place], [1,2])), false)
  assert.equal(isInstagramPreview(data([place], [])), false)
  assert.equal(isInstagramPreview(data([], [1,2])), true)
})
