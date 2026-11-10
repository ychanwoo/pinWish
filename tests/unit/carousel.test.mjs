import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractCarousel, validateExtraction, boundedFetch } from '../../scripts/instagram/carousel.mjs'
const photo = { media_type: 1, image_versions2: { candidates: [{ url: 'https://scontent.cdninstagram.com/photo.jpg' }] } }
const html = value => `<script type="application/json">${JSON.stringify(value)}</script>`
test('extracts only the requested post and preserves slide order', () => {
  const p = extractCarousel(html({ data: [{ code: 'other', carousel_media: [photo] }, { code: 'abc', caption: { text: 'caption' }, carousel_media: [photo, photo] }] }), 'abc')
  assert.equal(p.images.length, 2)
  assert.deepEqual(p.images.map(i => i.slide), [1,2])
  assert.equal(p.caption, 'caption')
})
test('fails explicitly on videos, missing slides, and changed HTML', () => {
  assert.throws(() => extractCarousel(html({ code: 'abc', carousel_media: [{ media_type: 2 }] }), 'abc'), /unsupported_video_slide/)
  assert.throws(() => extractCarousel(html({ code: 'abc', carousel_media: [{ media_type: 1 }] }), 'abc'), /partial_carousel/)
  assert.throws(() => extractCarousel('<html>Log in</html>', 'abc'), /carousel_unavailable/)
})
test('media fetch rejects non-Meta hosts before making a request', async () => {
  for (const url of ['https://127.0.0.1/', 'https://cdninstagram.com.evil.test/', 'http://scontent.cdninstagram.com/a', 'https://user:secret@scontent.cdninstagram.com/a']) await assert.rejects(boundedFetch(url, { image: true }), /unsupported_url/)
})
const place = { name: 'Museum', regionHint: 'LA', evidence: 'Museum', slides: [2] }
test('output validation rejects missing coverage and contradictory ignored slides', () => {
  assert.throws(() => validateExtraction({ places: [place], ignoredSlides: [] }, 3), /coverage/)
  assert.throws(() => validateExtraction({ places: [place], ignoredSlides: [1,2,3] }, 3), /invalid_model_output/)
  assert.throws(() => validateExtraction({ places: [{ ...place, slides: [99] }], ignoredSlides: [1] }, 2), /invalid_model_output/)
})
test('deduplicates exact names within a region and never accepts coordinates from a model', () => {
  const r = validateExtraction({ places: [{ ...place, lat: 123 }, { ...place, slides: [3] }], ignoredSlides: [1] }, 3)
  assert.equal(r.places.length, 1)
  assert.deepEqual(r.places[0].slides, [2,3])
  assert.equal(r.places[0].lat, undefined)
  assert.equal(r.places[0].needsLocationConfirmation, true)
})
