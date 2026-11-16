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

test('rejects nearby streets, tenants and differently named attractions', () => {
  assert.equal(pickNamedPlace([{ name: 'Brooklyn Bridge Blvd, Brooklyn, NY', placeType: 'Street' }], 'Brooklyn Bridge'), undefined)
  assert.equal(pickNamedPlace([{ name: 'Under the Manhattan Bridge', placeType: 'PointOfInterest' }], 'Manhattan Bridge'), undefined)
  assert.equal(pickNamedPlace([{ name: 'Guggenheim Museum Cafe', placeType: 'PointOfInterest' }], 'Guggenheim Museum'), undefined)
  assert.equal(pickNamedPlace([{ name: 'Guggenheim Museum Cafe' }, { name: 'Guggenheim Museum' }], 'Guggenheim Museum')?.name, 'Guggenheim Museum')
})

test('an explicitly requested street may match its provider abbreviation', () => {
  const street = { name: 'Rodeo Dr, Beverly Hills, CA 90210, United States', placeType: 'Street' }
  assert.equal(pickNamedPlace([street], 'Rodeo Drive'), street)
  assert.equal(pickNamedPlace([{ name: 'Museum Rd', placeType: 'Street' }], 'Museum'), undefined)
})

test('a transport operator prefix does not reject the named station', () => {
  assert.equal(pickNamedPlace([{ name: 'Metro-Union Station' }], 'Union Station')?.name, 'Metro-Union Station')
  assert.equal(pickNamedPlace([{ name: 'Union Station Cafe' }], 'Union Station'), undefined)
})

test('exact bridge beats a neighboring park, and explicit regions do not become cities', () => {
  const bridge = { name: 'Brooklyn Bridge', placeType: 'PointOfInterest' }
  assert.equal(pickNamedPlace([{ name:'Brooklyn Bridge Park',placeType:'PointOfInterest' },bridge], 'Brooklyn Bridge', 'place'), bridge)
  const area = { name:'Central Park, New York, NY, United States',placeType:'District' }
  assert.equal(pickNamedPlace([area,{name:'Central Park',placeType:'PointOfInterest'}],'Central Park','place'),area)
  assert.equal(pickNamedPlace([{name:'New York',placeType:'Locality'}],'New York','area'),undefined)
  assert.equal(pickNamedPlace([{name:'Williamsburg, Brooklyn, NY',placeType:'District'}],'Williamsburg','area')?.placeType,'District')
  assert.equal(pickNamedPlace([{name:'Times Sq, New York, NY',placeType:'Street'}],'Times Square','area')?.placeType,'Street')
})
test('proper museum prefixes are accepted but cafes and unrelated categories are not', () => {
  assert.equal(pickNamedPlace([{name:'Solomon R Guggenheim Museum'}],'Guggenheim Museum','place')?.name,'Solomon R Guggenheim Museum')
  assert.equal(pickNamedPlace([{name:'Grand Central Station'}],'Grand Central Market','place'),undefined)
  assert.equal(pickNamedPlace([{name:'Guggenheim Museum Cafe'}],'Guggenheim Museum','place'),undefined)
  assert.equal(pickNamedPlace([{name:'W Broadway',placeType:'Street'},{name:'Broadway',placeType:'Street'}],'Broadway','street')?.name,'Broadway')
})
