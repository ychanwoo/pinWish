// Only routing is live. Users, places, hours and DynamoDB are local fixtures.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { GeoRoutesClient } from '@aws-sdk/client-geo-routes'
import { itineraryFixture } from '../../tests/itinerary-fixture.mjs'
if(process.env.PINWISH_RUN_ROUTE_BOUNDARY_TESTS !== '1') throw Error('Explicit paid routing opt-in required')
const window=JSON.parse(await readFile('.aws-runtime.local'))
if(!window.enabled || Date.parse(window.until)<=Date.now()) throw Error('Open a bounded test session first')
const client=new GeoRoutesClient({region:process.env.AWS_REGION??'us-east-1',maxAttempts:1})
try {
 const f=await itineraryFixture({count:20,liveRoutesClient:client})
 const prepare=await f.call('POST','/collections/default/itineraries/prepare',{ids:f.places.map(p=>p.id)})
 assert.equal(prepare.statusCode,200)
 const settings={date:new Date(Date.now()+7*86400000).toISOString().slice(0,10),start:'09:00',end:'18:00',days:0,mode:'Car',order:'recommended',stops:f.places.map(p=>({id:p.id,duration:60}))}
 const body={contextId:JSON.parse(prepare.body).contextId,settings}
 const response=await f.call('POST','/itineraries/preview',body)
 assert.equal(response.statusCode,200,response.body)
 const preview=JSON.parse(response.body),stops=preview.plan.days.flatMap(d=>d.stops)
 assert.equal(stops.length,20)
 assert.equal(new Set(stops.map(s=>s.id)).size,20)
 assert.equal(f.providerCalls.matrix,4)
 assert.ok(f.state.routeInputs.every(x=>x.Origins.length*x.Destinations.length<=100))
 const retry=await f.call('POST','/itineraries/preview',body)
 assert.equal(retry.statusCode,200)
 assert.equal(f.providerCalls.matrix,4)
 const result={testedAt:new Date().toISOString(),passed:true,scope:'Current backend handler with in-memory storage and synthetic place/hour fixtures; real AWS route matrix provider',places:20,routeRequests:4,billedRoutePairs:400,cacheRepeatProviderRequests:0,allSelectionsIncluded:true,awsUserDataWrites:0}
 await writeFile('infra/generated/release-route-boundary.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result))
} finally {client.destroy()}
