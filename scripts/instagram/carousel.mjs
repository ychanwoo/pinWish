// Experimental public HTML reader. Not a supported Instagram API or a production guarantee.
export function extractCarousel(html, shortcode) {
  const matches = []
  function walk(value) {
    if (!value || typeof value !== 'object') return
    if (value.code === shortcode && Array.isArray(value.carousel_media)) matches.push(value)
    for (const child of Object.values(value)) walk(child)
  }
  for (const match of html.matchAll(/<script\b[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try { walk(JSON.parse(match[1])) } catch { /* A changed document format must fail closed. */ }
  }
  const post = matches[0]
  if (!post || !post.carousel_media.length || post.carousel_media.length > 20) throw new Error('carousel_unavailable')
  const images = post.carousel_media.map((child, index) => {
    if (child.media_type !== 1) throw new Error('unsupported_video_slide')
    const url = child.image_versions2?.candidates?.[0]?.url ?? child.display_uri
    if (typeof url !== 'string') throw new Error('partial_carousel')
    return { slide: index + 1, url }
  })
  return { shortcode, caption: typeof post.caption?.text === 'string' ? post.caption.text.slice(0, 12000) : '', images }
}
export async function boundedFetch(url, { image = false, signal } = {}) {
  const parsed = new URL(url)
  const allowed = image
    ? ['cdninstagram.com', 'fbcdn.net'].some(host => parsed.hostname.endsWith(`.${host}`))
    : parsed.hostname === 'www.instagram.com' && /^\/p\/[A-Za-z0-9_-]{1,64}\/$/.test(parsed.pathname)
  if (!allowed || parsed.protocol !== 'https:' || parsed.port || parsed.username || parsed.password) throw new Error('unsupported_url')
  const response = await fetch(url, { redirect: 'manual', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),
    headers: { Accept: image ? 'image/jpeg,image/png' : 'text/html', 'User-Agent': 'PinWish-Feasibility-Check/0.1' } })
  if (response.status !== 200) { await response.body?.cancel(); throw new Error(`http_${response.status}`) }
  const mime = (response.headers.get('content-type') ?? '').split(';')[0]
  if (!(image ? ['image/jpeg', 'image/png'].includes(mime) : mime === 'text/html')) {
    await response.body?.cancel(); throw new Error('unsupported_content_type')
  }
  const reader = response.body.getReader()
  const chunks = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > (image ? 3_500_000 : 1_048_576)) { await reader.cancel(); throw new Error('response_too_large') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  return { bytes: Buffer.concat(chunks), format: mime === 'image/png' ? 'png' : 'jpeg' }
}
export async function readCarousel(shortcode, { signal } = {}) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(shortcode)) throw new Error('invalid_shortcode')
  const { bytes } = await boundedFetch(`https://www.instagram.com/p/${shortcode}/`, { signal })
  return extractCarousel(bytes.toString('utf8'), shortcode)
}

export function validateExtraction(result, count) {
  const validSlide = n => Number.isInteger(n) && n >= 1 && n <= count
  if (!result || !Array.isArray(result.places) || !Array.isArray(result.ignoredSlides) || result.places.length > 40 || !result.ignoredSlides.every(validSlide)) throw new Error('invalid_model_output')
  const merged = new Map()
  for (const place of result.places) {
    if (!place || typeof place.name !== 'string' || !place.name.trim() || place.name.length > 200 || typeof place.regionHint !== 'string' || place.regionHint.length > 200 || typeof place.evidence !== 'string' || !place.evidence.trim() || place.evidence.length > 1000 || !Array.isArray(place.slides) || !place.slides.length || !place.slides.every(validSlide)) throw new Error('invalid_model_output')
    if (place.slides.some(n => result.ignoredSlides.includes(n))) throw new Error('invalid_model_output')
    const key = `${place.name.trim().normalize('NFKC').toLowerCase()}|${place.regionHint.trim().normalize('NFKC').toLowerCase()}`
    const existing = merged.get(key)
    if (existing) existing.slides = [...new Set([...existing.slides, ...place.slides])].sort((a,b) => a-b)
    else merged.set(key, { name: place.name.trim(), regionHint: place.regionHint.trim(), evidence: place.evidence, slides: [...new Set(place.slides)], needsLocationConfirmation: true })
  }
  const places = [...merged.values()]
  const covered = new Set([...result.ignoredSlides, ...places.flatMap(p => p.slides)])
  if (covered.size !== count) throw new Error('model_slide_coverage_incomplete')
  return { places, ignoredSlides: [...new Set(result.ignoredSlides)] }
}
