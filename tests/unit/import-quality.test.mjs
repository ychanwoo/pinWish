import { test } from 'node:test'
import assert from 'node:assert/strict'
import { imageBatches, parseBatchResponse } from '../../scripts/instagram/model-output.mjs'
import { importErrorCode } from '../../scripts/instagram/errors.mjs'
import { compareGroundTruth } from '../../scripts/instagram/compare-ground-truth.mjs'

const place = { name: '한글 장소', regionHint: '', evidence: '한글 장소', slides: [5] }
const response = result => ({ stopReason: 'end_turn', output: { message: { content: [{ text: `\n\`\`\`json\n${JSON.stringify(result)}\n\`\`\`\n` }] } } })
test('batches respect count and byte budgets without dropping or reordering photos', () => {
  const images = [1,2,3,4,5,6,7].map(slide => ({ slide, bytes: { length: 1_400_000 } }))
  const batches = imageBatches(images)
  assert.deepEqual(batches.map(b => b.map(i => i.slide)), [[1,2],[3,4],[5,6],[7]])
  assert.deepEqual(imageBatches(images.map(i => ({ ...i, bytes: { length: 100 } }))).map(b => b.length), [3,3,1])
})
test('batch validation preserves original numbering and Korean while rejecting omitted/foreign/contradictory slides', () => {
  assert.deepEqual(parseBatchResponse(response({ places: [place], ignoredSlides: [4,6] }), [4,5,6]).places[0].slides, [5])
  for (const result of [
    { places: [place], ignoredSlides: [4] },
    { places: [{ ...place, slides: [2] }], ignoredSlides: [4,6] },
    { places: [place], ignoredSlides: [4,5,6] },
    { places: [null], ignoredSlides: [4,6] },
    { places: [{ ...place, evidence: '' }], ignoredSlides: [4,6] },
  ]) assert.throws(() => parseBatchResponse(response(result), [4,5,6]))
  assert.throws(() => parseBatchResponse({ ...response({}), stopReason: 'max_tokens' }, [1]), /incomplete/)
  assert.throws(() => parseBatchResponse(response(null), [1]), /invalid_model_output/)
})
test('account setup, throttling and timeouts remain distinct without leaking raw errors', () => {
  assert.equal(importErrorCode({ name: 'ResourceNotFoundException', message: 'Model use case details have not been submitted for account 1234' }), 'aws_model_setup_required')
  assert.equal(importErrorCode({ name: 'ThrottlingException' }), 'aws_throttled')
  assert.equal(importErrorCode({ name: 'TimeoutError' }), 'analysis_timeout')
  assert.equal(importErrorCode({ message: 'secret provider diagnostic' }), 'lookup_failed')
})
test('evaluation fails correct counts with a wrong name or extra slide attribution', () => {
  const sample = { shortcode: 'example', slideCount: 3, ignoredSlides: [1,3], expected: [{ slide: 2, heading: '바다', aliases: ['Sea'] }] }
  const report = name => ({ fetchedImages: 3, result: { places: [{ name, slides: [2] }], ignoredSlides: [1,3] } })
  assert.equal(compareGroundTruth(report('바다'), sample).passed, true)
  assert.equal(compareGroundTruth(report('바타'), sample).passed, false)
  const extra = report('바다'); extra.result.places[0].slides.push(1)
  assert.equal(compareGroundTruth(extra, sample).passed, false)
})
