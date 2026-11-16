import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPlaceService } from '../../scripts/places/service.mjs'
const city = { PlaceType:'Locality', Position:[-74,40.7], MapView:[-74.2,40.5,-73.7,40.9], Address:{Country:{Code2:'US'}} }
const raw = (id,position,country='US') => ({PlaceId:id,Title:'Example Museum',PlaceType:'PointOfInterest',Position:position,Address:{Label:'Example Museum, New York',Country:{Code2:country,Name:country}}})
test('uses provider region coordinates, caches the region and rejects distant/cross-country namesakes', async () => {
  let geocodes=0;const searches=[]
  const service=createPlaceService({client:{async send(command){
    if(command.constructor.name==='GeocodeCommand'){geocodes++;return {ResultItems:[city]}}
    searches.push(command.input);return {ResultItems:[raw('near',[-74,40.72]),raw('far',[-122,37]),raw('other',[-74,40.72],'CA')]}
  }}})
  const input={query:'Example Museum',region:'New York',countryCode:''}
  const result=await service.search(input);await service.search({...input,query:'Other Museum'})
  assert.equal(geocodes,1);assert.equal(result.matches.length,1);assert.equal(result.regionResolved,true)
  assert.equal(result.excludedResults,2);assert.equal(searches[0].QueryText,'Example Museum')
  assert.deepEqual(searches[0].BiasPosition,[-74,40.7]);assert.deepEqual(searches[0].Filter,{IncludeCountries:['US']})
  service.close()
})
test('an unresolved region stays explicit; named districts are supported but countries/cities are not saved', async () => {
  const service=createPlaceService({client:{async send(c){return {ResultItems:c.constructor.name==='GeocodeCommand'?[]:[{...raw('area',[-74,40.7]),PlaceType:'District',Title:'Example Quarter, New York'}, {...raw('country',[-74,40.7]),PlaceType:'Country'}]}}}})
  const result=await service.search({query:'Example Quarter',region:'Unknown region',countryCode:''})
  assert.equal(result.regionResolved,false);assert.equal(result.matches.length,1)
  assert.equal(result.matches[0].englishName,'Example Quarter');service.close()
})
