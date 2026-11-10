import { test } from 'node:test'
import assert from 'node:assert/strict'
import { probe, handler } from '../../scripts/instagram/probe.mjs'

test('rejects arbitrary outbound URLs and oversized batches', async () => {
  await assert.rejects(probe('https://localhost/'))
  await assert.rejects(handler({ shortcodes: ['a', 'b', 'c', 'd'] }))
})
test('redirects are never followed and auth URLs are not returned', async () => {
  const r = await probe('abc', async (url, options) => {
    assert.equal(url, 'https://www.instagram.com/p/abc/')
    assert.equal(options.redirect, 'manual')
    assert.equal(options.headers.Cookie, undefined)
    return new Response(null, { status: 302, headers: { location: 'https://example.test/?token=secret' } })
  })
  assert.equal(r.outcome, 'redirect_not_followed')
  assert.ok(!JSON.stringify(r).includes('secret'))
})
test('HTTP 200 and metadata never count as carousel access', async () => {
  const r = await probe('abc', async () => new Response('<meta property="og:image" content="preview">', { headers: { 'content-type': 'text/html' } }))
  assert.equal(r.hasPreviewMetadata, true)
  assert.equal(r.carouselAccessVerified, false)
})
test('limits response body size', async () => {
  const r = await probe('abc', async () => new Response('x'.repeat(1024 * 1024 + 1), { headers: { 'content-type': 'text/html' } }))
  assert.equal(r.truncated, true)
})
test('does not leak network errors or cookies', async () => {
  const r = await probe('abc', async () => { throw new Error('secret credentials') })
  assert.equal(r.outcome, 'network_error')
  assert.ok(!JSON.stringify(r).includes('secret'))
})
