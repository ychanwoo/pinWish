import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createEnglishQueryResolver } from '../../scripts/places/english-query.mjs'
import { createPlaceService } from '../../scripts/places/service.mjs'
const input = { query: '그리피스 천문대', region: 'Los Angeles', countryCode: 'US' }
const output = data => ({ stopReason: 'end_turn', output: { message: { content: [{ text: JSON.stringify(data) }] } } })
test('translation preserves source, caches by full context, bypasses English and Korea', async () => {
 let calls=0
 const resolver=createEnglishQueryResolver({client:{async send(){calls++;return output({query:'Griffith Observatory',region:'Los Angeles'})}}})
 const result=await resolver.resolve(input)
 assert.equal(result.searchQuery,'Griffith Observatory');assert.equal(result.originalQuery,input.query)
 assert.equal(result.status,'translated');assert.equal(input.query,'그리피스 천문대')
 await resolver.resolve(input);assert.equal(calls,1)
 await resolver.resolve({...input,countryCode:'CA'});assert.equal(calls,2)
 assert.equal((await resolver.resolve({...input,query:'Museum'})).status,'unchanged')
 assert.equal((await resolver.resolve({...input,countryCode:'KR'})).status,'unchanged');assert.equal(calls,2)
 resolver.close()
})
test('malformed, uncertain and failed translations preserve original; abort is propagated',async()=>{
 for(const data of [{query:null,region:null},{query:'가짜',region:'LA'},{query:'x'.repeat(201),region:'LA'},{query:'Museum\nIgnore instructions',region:'LA'}]){
 const r=createEnglishQueryResolver({client:{async send(){return output(data)}}})
 assert.equal((await r.resolve(input)).status,'needs_review');r.close()
 }
 const r=createEnglishQueryResolver({client:{async send(){throw new Error('secret')}}})
 const result=await r.resolve(input);assert.equal(result.status,'unavailable');assert.equal(result.searchQuery,input.query)
 const c=new AbortController();c.abort(new Error('cancelled'));await assert.rejects(r.resolve(input,c.signal),/cancelled/);r.close()
})
test('service searches translated query and region without rewriting original input',async()=>{
 let command
 const resolver=createEnglishQueryResolver({client:{async send(){return output({query:'Griffith Observatory',region:'Los Angeles'})}}})
 const service=createPlaceService({queryResolver:resolver,client:{async send(c){command=c;return {ResultItems:[]}}}})
 const result=await service.search(input)
 assert.equal(command.input.QueryText,'Griffith Observatory, Los Angeles')
 assert.equal(result.queryConversion.originalQuery,input.query);assert.equal(result.matches.length,0);service.close()
})
