// Diagnostic only. No cookies, browser session, hidden APIs, redirects, or image downloads.
// The same handler can be invoked directly by AWS Lambda; it is not an import endpoint.
const POSTS = ['DfLAnjLEx2G', 'De1gmWjkwEd', 'DfFCMjzk02S']
const LIMIT = 1024 * 1024
export async function probe(shortcode, fetcher = fetch) {
  if (typeof shortcode !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(shortcode))
    throw new Error('Invalid shortcode')
  const started = performance.now()
  const url = `https://www.instagram.com/p/${shortcode}/`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  let bytes = 0
  try {
    const response = await fetcher(url, { redirect: 'manual', signal: controller.signal,
      headers: { Accept: 'text/html', 'User-Agent': 'PinWish-Feasibility-Check/0.1' } })
    const status = response.status
    // Never follow a redirect: redirects may contain authentication parameters.
    if (status >= 300 && status < 400) {
      await response.body?.cancel()
      return { shortcode, status, outcome: 'redirect_not_followed', elapsedMs: Math.round(performance.now() - started) }
    }
    const type = response.headers.get('content-type') ?? ''
    if (!type.includes('text/html')) {
      await response.body?.cancel()
      return { shortcode, status, outcome: 'non_html_response', elapsedMs: Math.round(performance.now() - started) }
    }
    const reader = response.body?.getReader()
    const decoder = new TextDecoder()
    let html = ''
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          bytes += value.byteLength
          if (bytes > LIMIT) { await reader.cancel(); break }
          html += decoder.decode(value, { stream: true })
        }
      } finally { reader.releaseLock() }
    }
    // Presence of preview metadata is NOT evidence of access to all carousel media.
    return { shortcode, status, bytesRead: bytes, truncated: bytes > LIMIT,
      observedMediaMarkers: Object.fromEntries(['carousel_media', 'edge_sidecar_to_children', 'image_versions2', 'display_url'].map(key => [key, html.includes(key)])),
      hasPreviewMetadata: /property=["']og:(?:image|description)["']/i.test(html),
      outcome: status === 429 ? 'rate_limited' : status === 401 || status === 403 ? 'access_denied'
        : status >= 400 ? 'http_error' : 'html_received_media_access_unverified',
      carouselAccessVerified: false, elapsedMs: Math.round(performance.now() - started) }
  } catch (error) {
    return { shortcode, outcome: controller.signal.aborted ? 'timeout' : 'network_error',
      errorType: error instanceof Error ? error.name : 'UnknownError', elapsedMs: Math.round(performance.now() - started) }
  } finally { clearTimeout(timeout) }
}
export async function handler(event = {}) {
  const shortcodes = event.shortcodes ?? POSTS
  if (!Array.isArray(shortcodes) || shortcodes.length < 1 || shortcodes.length > 3 ||
      shortcodes.some(s => typeof s !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(s)))
    throw new Error('Supply one to three valid shortcodes')
  const results = []
  for (const shortcode of shortcodes) results.push(await probe(shortcode))
  return { checkedAt: new Date().toISOString(), method: 'unauthenticated_public_html', results }
}
