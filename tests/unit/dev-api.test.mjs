import { test } from 'node:test'
import assert from 'node:assert/strict'
import { request } from 'node:http'
import { once } from 'node:events'
import { createDevServer } from '../../scripts/instagram/dev-server.mjs'
import { PlaceError } from '../../scripts/places/service.mjs'
async function run(t, overrides = {}) {
  const server = createDevServer({ extract: async () => ({}), placeService: { async search() { return { matches: [] } }, async details() { throw new PlaceError('selection_expired',409) }, close() {} }, ...overrides })
  server.listen(0,'127.0.0.1'); await once(server,'listening')
  t.after(() => { server.closeAllConnections(); server.close() })
  const url = `http://127.0.0.1:${server.address().port}`
  return (path, body, headers = {}) => new Promise((resolve, reject) => {
    const req = request(url+path, { method:'POST', headers:{ 'content-type':'application/json', ...headers } }, res => {
      let data = ''; res.on('data', chunk => { data += chunk }); res.on('end', () => resolve({ status:res.statusCode, body:JSON.parse(data) }))
    }); req.on('error',reject); req.end(typeof body === 'string' ? body : JSON.stringify(body))
  })
}
test('local API rejects cross-origin/host, oversized, malformed and wrong media requests', async t => {
  const post = await run(t)
  assert.equal((await post('/api/places/search',{}, {origin:'https://evil.example'})).status,403)
  assert.equal((await post('/api/places/search',{}, {host:'evil.example'})).status,403)
  assert.equal((await post('/api/places/search',{}, {'sec-fetch-site':'cross-site'})).status,403)
  assert.equal((await post('/api/places/search',{}, {'content-type':'text/plain'})).status,415)
  assert.equal((await post('/api/places/search','{')).status,400)
  assert.equal((await post('/api/places/search',null)).status,400)
  assert.equal((await post('/api/places/search',{query:'x'.repeat(5000)})).status,413)
  assert.equal((await post('/api/instagram/preview',{input:'https://instagram.com/reel/abc/'})).status,422)
})
test('search and import budgets are separate, and detail errors preserve actionable codes', async t => {
  const post = await run(t,{placesLimit:2,importLimit:1})
  assert.equal((await post('/api/places/search',{})).status,200)
  assert.deepEqual(await post('/api/places/details',{}),{status:409,body:{code:'selection_expired'}})
  assert.deepEqual(await post('/api/places/search',{}),{status:429,body:{code:'places_session_limit'}})
  assert.equal((await post('/api/instagram/preview',{input:'https://instagram.com/p/abc/'})).status,200)
  assert.equal((await post('/api/instagram/preview',{input:'https://instagram.com/p/abc/'})).status,429)
})
