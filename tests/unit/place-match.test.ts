import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickNamedPlace, regionalSearchHint } from '../../src/lib/place-match.ts'
test('does not substitute a tenant for a requested building', () => {
  assert.equal(pickNamedPlace([{ name: 'Blue Bottle Coffee - Bradbury' }, { name: 'Neuehouse Bradbury' }], 'Bradbury Building'), undefined)
  assert.equal(pickNamedPlace([{ name: 'Bradbury Building' }], 'Bradbury Building')?.name, 'Bradbury Building')
})
test('accepts provider suffixes and preserves ranking among matching branches', () => {
  assert.equal(pickNamedPlace([{ name: 'Point Dume State Beach' }], 'Point Dume')?.name, 'Point Dume State Beach')
  const matches = [{ name: "RANDY’S DONUTS", id: 1 }, { name: "Randy's Donuts", id: 2 }]
  assert.equal(pickNamedPlace(matches, 'Randys Donuts')?.id, 1)
  assert.equal(pickNamedPlace([{ name: 'Westward Beach Road' }], 'Point Dume'), undefined)
})

test('regional fallback removes street and US postal constraint but preserves city/state', () => {
  assert.equal(regionalSearchHint('304 S Broadway, Los Angeles, CA 90013'), 'Los Angeles, CA')
  assert.equal(regionalSearchHint('No structured address'), '')
})

test('possessive transliterations do not reject an otherwise matching venue', () => {
  assert.equal(pickNamedPlace([{ name: 'Musso & Frank Grill' }], "Moose and Frank's Grill")?.name, 'Musso & Frank Grill')
})
