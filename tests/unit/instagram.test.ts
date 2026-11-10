import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseInstagramLink } from '../../src/lib/instagram.ts'

for (const shortcode of ['DfLAnjLEx2G', 'De1gmWjkwEd', 'DfFCMjzk02S']) {
  test(`normalizes ${shortcode} without losing source or slide`, () => {
    const original = `https://www.instagram.com/p/${shortcode}/?img_index=10&utm_source=test`
    const a = parseInstagramLink(original)
    const b = parseInstagramLink(`https://instagram.com/p/${shortcode}/?img_index=1`)
    assert.ok(a.ok && b.ok)
    assert.equal(a.source.identity, b.source.identity)
    assert.equal(a.source.canonicalUrl, `https://www.instagram.com/p/${shortcode}/`)
    assert.equal(a.source.selectedSlide, 10)
    assert.equal(a.source.originalUrl, original)
  })
}
for (const url of [
  'http://instagram.com/p/abc/', 'https://instagram.com.evil.test/p/abc/',
  'https://instagram.com@evil.test/p/abc/', 'https://evil.test/?q=instagram.com/p/abc',
  'https://user:pass@instagram.com/p/abc/', 'https://instagram.com:444/p/abc/',
  'https://127.0.0.1/p/abc/', 'file:///etc/passwd', 'javascript:alert(1)',
  'https://instagram.com/profile/', 'https://instagram.com/stories/user/123/',
  'https://instagram.com/share/abc/', 'https://instagram.com/p/a/b/',
  'https://instagram.com/p/a%2fb/', 'https://instagram.com\\@evil.test/p/a/',
  'https://instagram.com/p/abc/ extra', 'x'.repeat(2049), '',
]) test(`rejects ${url.slice(0, 70)}`, () => assert.equal(parseInstagramLink(url).ok, false))
test('preserves case-sensitive shortcodes and supports reels', () => {
  const r = parseInstagramLink(' https://m.instagram.com/reel/Ab_C-d/?img_index=-1#x ')
  assert.ok(r.ok)
  assert.equal(r.source.canonicalUrl, 'https://www.instagram.com/reel/Ab_C-d/')
  assert.equal(r.source.selectedSlide, null)
})
