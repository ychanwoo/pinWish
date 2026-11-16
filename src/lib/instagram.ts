/** Validates URL syntax and supported media paths, not post existence or readability. */
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
  | { ok: false; code: 'invalid_url' | 'unsupported_host' | 'unsupported_path' | 'unsupported_media'; message: string }

export function parseInstagramLink(input: string): InstagramLinkResult {
  const originalUrl = input.trim()
  const invalid = (message: string): InstagramLinkResult => ({ ok: false, code: 'invalid_url', message })
  if (!originalUrl || originalUrl.length > 2048 || /[\s\\]/.test(originalUrl))
    return invalid('Enter a complete HTTPS link to a public Instagram photo post.')
  let url: URL
  try { url = new URL(originalUrl) } catch { return invalid('Enter a complete HTTPS link.') }
  if (url.protocol !== 'https:' || url.username || url.password || url.port)
    return invalid('Use an HTTPS link without credentials or a custom port.')
  if (!['instagram.com', 'www.instagram.com', 'm.instagram.com'].includes(url.hostname))
    return { ok: false, code: 'unsupported_host', message: 'Use a link from instagram.com.' }
  const match = /^\/(p|reel)\/([A-Za-z0-9_-]{1,64})\/?$/.exec(url.pathname)
  if (!match)
    return { ok: false, code: 'unsupported_path', message: 'Open the photo post and copy its /p/ link. Profile, Story and share-redirect links are not supported yet.' }
  if (match[1] === 'reel')
    return { ok: false, code: 'unsupported_media', message: 'Reels are not supported. Use a public Instagram photo-post link instead.' }
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
