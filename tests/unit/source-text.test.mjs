import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groundedPlaces, modelJson, withoutRepeatedRegion } from '../../scripts/instagram/source-text.mjs'
const transcripts = [
  { slide: 1, authorText: 'Places to visit' },
  { slide: 2, authorText: '두 곳: 센트럴파크, 도미노파크에서 피크닉' },
  { slide: 3, authorText: 'Follow us' },
]
const candidate = { name: '센트럴파크', regionHint: '뉴욕', locationHint: '', searchQuery: 'Central Park New York', searchName: 'Central Park', searchRegion: 'New York', locationType: 'place', slides: [2] }
test('separates named places on one slide and preserves actual source evidence', () => {
  const result = groundedPlaces({ places: [candidate, { ...candidate, name: '도미노파크', searchName: 'Domino Park', searchQuery: 'Domino Park', evidence: 'invented' }] }, transcripts)
  assert.equal(result.places.length, 2)
  assert.equal(result.places[0].name, '센트럴파크')
  assert.equal(result.places[0].searchQuery, 'Central Park')
  assert.ok(result.places.every(p => p.evidence === transcripts[1].authorText))
  assert.deepEqual(result.ignoredSlides, [1,3])
})
test('rejects names not grounded in every referenced author text and invented addresses', () => {
  assert.equal(groundedPlaces({ places: [{ ...candidate, name: 'AMBASSADOR' }] }, transcripts).places.length, 0)
  assert.equal(groundedPlaces({ places: [{ ...candidate, slides: [1,2] }] }, transcripts).places.length, 0)
  assert.equal(groundedPlaces({ places: [{ ...candidate, locationHint: '1 Invented Street' }] }, transcripts).places[0].locationHint, '')
  assert.throws(() => groundedPlaces({ places: [{ ...candidate, slides: [4] }] }, transcripts))
  for (const invalid of [{ searchQuery: '가짜' }, { locationType: 'country' }, { searchName: 'x'.repeat(201) }])
    assert.throws(() => groundedPlaces({ places: [{ ...candidate, ...invalid }] }, transcripts))
})
test('region stripping keeps contextual qualifiers and does not alter the place identity', () => {
  assert.equal(withoutRepeatedRegion('Broadway theater district New York', 'Broadway', 'New York'), 'Broadway theater district')
  assert.equal(withoutRepeatedRegion('Williamsburg Brooklyn', 'Williamsburg', 'Brooklyn, New York'), 'Williamsburg')
  assert.equal(withoutRepeatedRegion('New York University', 'New York University', 'New York'), 'New York University')
})
test('truncated or malformed model replies never produce partial candidates', () => {
  assert.throws(() => modelJson({stopReason:'max_tokens'}),/incomplete/)
  assert.throws(() => modelJson({stopReason:'end_turn',output:{message:{content:[{text:'not json'}]}}}),/json/)
})

test('malformed model JSON gets one bounded retry with complete usage accounting', async () => {
  const { requestModelJson } = await import('../../scripts/instagram/source-text.mjs')
  let calls = 0
  const client = {send: async () => ({stopReason:'end_turn',output:{message:{content:[{text:++calls === 1 ? '{broken' : '{"authorText":"Central Park"}'}]}},usage:{inputTokens:10,outputTokens:5,totalTokens:15}})}
  const result = await requestModelJson(client, {}, new AbortController().signal)
  assert.equal(result.requests, 2)
  assert.equal(result.data.authorText, 'Central Park')
  assert.equal(result.usage.totalTokens, 30)
  calls = 0
  await assert.rejects(requestModelJson({send:async()=>{calls++;return {stopReason:'end_turn',output:{message:{content:[{text:'broken'}]}}}}}, {}, new AbortController().signal), /invalid_model_json/)
  assert.equal(calls, 2)
})
