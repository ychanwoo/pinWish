import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getPlaceDisplayName } from '../../src/lib/place-name.ts'

test('confirmed country, not source language, determines the display language', () => {
  assert.equal(getPlaceDisplayName({ sourceName: '그리피스 천문대', confirmedLocation: {
    countryCode: 'US', englishName: 'Griffith Observatory', koreanName: '그리피스 천문대',
  } }), 'Griffith Observatory')
  assert.equal(getPlaceDisplayName({ sourceName: 'Mukho Cafe', confirmedLocation: {
    countryCode: 'kr', koreanName: '묵호다방', englishName: 'Mukho Cafe',
  } }), '묵호다방')
  assert.equal(getPlaceDisplayName({ sourceName: '東京タワー', confirmedLocation: {
    countryCode: 'JP', englishName: 'Tokyo Tower',
  } }), 'Tokyo Tower')
})

test('unconfirmed or unavailable localized names preserve source/correction without guessing', () => {
  const source = { sourceName: '포인트 듑', correctedName: '포인트 둠' }
  assert.equal(getPlaceDisplayName(source), '포인트 둠')
  for (const countryCode of ['', 'ZZ', 'USA']) assert.equal(getPlaceDisplayName({ ...source,
    confirmedLocation: { countryCode, englishName: 'Point Dume' },
  }), '포인트 둠')
  assert.equal(getPlaceDisplayName({ ...source, confirmedLocation: { countryCode: 'US', englishName: ' ' } }), '포인트 둠')
  assert.equal(getPlaceDisplayName({ sourceName: '원문', confirmedLocation: { countryCode: 'KR', englishName: 'English only' } }), '원문')
  assert.equal(getPlaceDisplayName({ ...source, confirmedLocation: { countryCode: 'US', englishName: 'Point Dume' } }), 'Point Dume')
  assert.equal(source.sourceName, '포인트 듑')
})

test('overseas visible labels never fall back to Korean while Korean places can retain it', async () => {
  const { visiblePlaceText } = await import('../../src/lib/place-name.ts')
  assert.equal(visiblePlaceText('그리피스 천문대', 'US', 'Place 1'), 'Place 1')
  assert.equal(visiblePlaceText('Griffith Observatory', 'US'), 'Griffith Observatory')
  assert.equal(visiblePlaceText('묵호다방', 'KR'), '묵호다방')
  assert.equal(visiblePlaceText('東京タワー', 'JP', 'Tokyo Tower'), 'Tokyo Tower')
})
