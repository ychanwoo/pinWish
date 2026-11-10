/** Syntax validation only: a valid URL does not prove that a post exists or is readable. */
export type InstagramSource = {
  originalUrl: string
  canonicalUrl: string
  shortcode: string
  kind: 'p' | 'reel'
  selectedSlide: number | null
  identity: string
}
export type InstagramLinkResult =
  | { ok: true; source: InstagramSource }
  | { ok: false; code: 'invalid_url' | 'unsupported_host' | 'unsupported_path'; message: string }

export function parseInstagramLink(input: string): InstagramLinkResult {
  const originalUrl = input.trim()
  const invalid = (message: string): InstagramLinkResult => ({ ok: false, code: 'invalid_url', message })
  if (!originalUrl || originalUrl.length > 2048 || /[\s\\]/.test(originalUrl))
    return invalid('Enter a complete Instagram post or Reel HTTPS link.')
  let url: URL
  try { url = new URL(originalUrl) } catch { return invalid('Enter a complete HTTPS link.') }
  if (url.protocol !== 'https:' || url.username || url.password || url.port)
    return invalid('Use an HTTPS link without credentials or a custom port.')
  if (!['instagram.com', 'www.instagram.com', 'm.instagram.com'].includes(url.hostname))
    return { ok: false, code: 'unsupported_host', message: 'Use a link from instagram.com.' }
  const match = /^\/(p|reel)\/([A-Za-z0-9_-]{1,64})\/?$/.exec(url.pathname)
  if (!match)
    return { ok: false, code: 'unsupported_path', message: 'Open the post and copy its /p/ or /reel/ link. Profile, Story and share-redirect links are not supported yet.' }
  const slide = url.searchParams.get('img_index')
  const selectedSlide = slide && /^[1-9]\d{0,5}$/.test(slide) ? Number(slide) : null
  const kind = match[1] as 'p' | 'reel'
  const shortcode = match[2]
  return { ok: true, source: {
    originalUrl, canonicalUrl: `https://www.instagram.com/${kind}/${shortcode}/`,
    shortcode, kind, selectedSlide, identity: `instagram:${shortcode}`,
  } }
}

/** Route every URL-like input through validation before considering sample place names. */
export function isUrlInput(input: string): boolean {
  return /^(?:[a-z][a-z\d+.-]*:|(?:www\.|m\.)?instagram\.com(?:\/|$))/i.test(input.trim())
}
