// Match an encyclopedia entry by both its title and coordinates before using its photo.
const USER_AGENT =
  'PinWish/0.1 (CS446 project; https://github.com/ychanwoo/pinWish)'
const plain = (s = '') =>
  s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1000)
const tokens = (s) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((x) => x && !['the', 'and', 'of', 'at', 'state'].includes(x))
function distance(a, b) {
  const r = Math.PI / 180,
    dlat = (a.latitude - b.lat) * r,
    dlon = (a.longitude - b.lon) * r
  return (
    12742000 *
    Math.asin(
      Math.sqrt(
        Math.sin(dlat / 2) ** 2 +
          Math.cos(a.latitude * r) *
            Math.cos(b.lat * r) *
            Math.sin(dlon / 2) ** 2,
      ),
    )
  )
}
function matchPage(place, page) {
  const full = place.displayName || place.name
  const specific = /\(([^()]+\bPier)\)/i.exec(full)?.[1]
  const a = tokens(specific || full.replace(/\s*\(.*\)/, '')),
    b = tokens(page.title.replace(/\s*\(.*\)/, ''))
  if (
    ['hotel', 'restaurant', 'cafe', 'station', 'pier'].some(
      (t) =>
        b.includes(t) && !tokens(place.displayName || place.name).includes(t),
    )
  )
    return -1
  const score = a.filter((x) => b.includes(x)).length / Math.max(1, a.length)
  const coord = page.coordinates?.find((c) => c.globe === 'earth' || !c.globe)
  const meters = coord ? distance(place.coordinates, coord) : Infinity
  return score >= 0.66 && meters <= 3000
    ? score * 10000 +
        tokens(place.displayName || place.name).filter((t) => b.includes(t))
          .length *
          500 -
        meters
    : -1
}
function imageUrl(value) {
  const u = new URL(value)
  if (
    u.protocol !== 'https:' ||
    u.username ||
    u.password ||
    u.port ||
    !['upload.wikimedia.org', 'thumb.wikimedia.org'].includes(u.hostname) ||
    !u.pathname.startsWith('/wikipedia/commons/')
  )
    throw Error('unsafe_photo_url')
  u.search = ''
  return u.href
}
async function boundedFetch(url, limit, fetcher = fetch) {
  const response = await fetcher(url, {
    headers: { 'User-Agent': USER_AGENT },
    redirect: 'error',
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw Error(`photo_provider_${response.status}`)
  if (Number(response.headers.get('content-length')) > limit)
    throw Error('photo_response_too_large')
  const chunks = []
  let size = 0
  for await (const chunk of response.body) {
    size += chunk.length
    if (size > limit) throw Error('photo_response_too_large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}
async function discoverPhoto(place, { fetcher = fetch } = {}) {
  const originalFetch = fetcher,
    deadline = AbortSignal.timeout(35000)
  fetcher = (url, options) =>
    originalFetch(url, {
      ...options,
      signal: AbortSignal.any([deadline, options.signal]),
    })
  const api = async (host, params) => {
    const data = JSON.parse(
      (
        await boundedFetch(
          `https://${host}/w/api.php?${new URLSearchParams({ action: 'query', format: 'json', ...params })}`,
          2_000_000,
          fetcher,
        )
      ).toString(),
    )
    if (data.error) throw Error('photo_provider_error')
    return Object.values(data.query?.pages ?? {})
  }
  const pages = await api('en.wikipedia.org', {
    generator: 'geosearch',
    ggscoord: `${place.coordinates.latitude}|${place.coordinates.longitude}`,
    ggsradius: '10000',
    ggslimit: '50',
    prop: 'coordinates|pageimages',
    piprop: 'name',
    colimit: 'max',
  })
  let matched = pages
    .filter((p) => matchPage(place, p) >= 0)
    .sort((a, b) => matchPage(place, b) - matchPage(place, a))[0]
  if (
    !matched ||
    tokens(matched.title.split(',')[0].replace(/\s*\(.*\)/, '')).join(' ') !==
      tokens((place.displayName || place.name).replace(/\s*\(.*\)/, '')).join(
        ' ',
      )
  ) {
    const name = (place.displayName || place.name)
      .replace(/\s*\(.*\)/, '')
      .replace(/^the /i, '')
    const more = await api('en.wikipedia.org', {
      generator: 'search',
      gsrsearch: '"' + name.replace(/"/g, '') + '"',
      gsrlimit: '5',
      prop: 'coordinates|pageimages|pageprops',
      piprop: 'name',
      ppprop: 'wikibase_item',
    })
    for (const page of more) {
      if (
        !page.coordinates &&
        /^Q[0-9]+$/.test(page.pageprops?.wikibase_item ?? '')
      ) {
        const id = page.pageprops.wikibase_item
        const data = JSON.parse(
          (
            await boundedFetch(
              'https://www.wikidata.org/w/api.php?' +
                new URLSearchParams({
                  action: 'wbgetentities',
                  format: 'json',
                  ids: id,
                  props: 'claims',
                }),
              2_000_000,
              fetcher,
            )
          ).toString(),
        )
        const c =
          data.entities?.[id]?.claims?.P625?.[0]?.mainsnak?.datavalue?.value
        if (c?.globe === 'http://www.wikidata.org/entity/Q2')
          page.coordinates = [
            { lat: c.latitude, lon: c.longitude, globe: 'earth' },
          ]
      }
    }
    matched = [...more, ...pages]
      .filter((p) => matchPage(place, p) >= 0)
      .sort((a, b) => {
        const exact = (p) =>
          tokens(p.title.split(',')[0].replace(/\s*\(.*\)/, '')).join(' ') ===
          tokens(name).join(' ')
            ? 100000
            : 0
        return exact(b) + matchPage(place, b) - exact(a) - matchPage(place, a)
      })[0]
  }
  if (!matched) return null
  let titles = matched.pageimage ? ['File:' + matched.pageimage] : []
  {
    const entries = await api('en.wikipedia.org', {
      pageids: String(matched.pageid),
      prop: 'images|pageprops',
      ppprop: 'wikibase_item',
      imlimit: '50',
    })
    // P18 belongs to the name-and-coordinate verified entity, so its filename
    // need not repeat the venue name (campus/library photos often do not).
    const entityId = entries[0]?.pageprops?.wikibase_item
    if (/^Q[0-9]+$/.test(entityId ?? '')) {
      const data = JSON.parse((await boundedFetch(
        'https://www.wikidata.org/w/api.php?' + new URLSearchParams({
          action: 'wbgetentities', format: 'json', ids: entityId, props: 'claims',
        }), 2_000_000, fetcher,
      )).toString())
      const images = (data.entities?.[entityId]?.claims?.P18 ?? [])
        .filter(c => c.rank !== 'deprecated')
        .map(c => c.mainsnak?.datavalue?.value)
        .filter(v => typeof v === 'string' && /\.jpe?g$/i.test(v) && !v.includes('|'))
        .slice(0, 3)
      titles.push(...images.map(name => 'File:' + name))
    }
    titles = [
      ...titles,
      ...(entries[0]?.images ?? [])
        .map((x) => x.title)
        .filter(
          (x) =>
            /\.jpe?g$/i.test(x) &&
            tokens(matched.title).filter((t) =>
              tokens(x).some((v) => v === t || v === t + 's'),
            ).length >= 2,
        )
        .slice(0, 5),
    ]
  }
  titles = [...new Set(titles)]
  if (!titles.length) return null
  const files = await api('commons.wikimedia.org', {
    titles: titles.join('|'),
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '1280',
    iiurlheight: '1280',
  })
  const normalizedTitle = (s) => s.replace(/_/g, ' ')
  files.sort(
    (a, b) =>
      titles.map(normalizedTitle).indexOf(a.title) -
      titles.map(normalizedTitle).indexOf(b.title),
  )
  for (const file of files) {
    const info = file.imageinfo?.[0],
      meta = info?.extmetadata
    if (
      !info ||
      info.mime !== 'image/jpeg' ||
      !meta ||
      /(map|logo|seal|diagram)/i.test(file.title)
    )
      continue
    const license = plain(meta.LicenseShortName?.value),
      author = plain(meta.Artist?.value)
    if (
      !/^(CC BY(?:-SA)? [1-4]\.[05]|CC0|Public domain)$/i.test(license) ||
      !author
    )
      continue
    const licenseUrl =
      meta.LicenseUrl?.value ||
      (license === 'Public domain'
        ? 'https://creativecommons.org/publicdomain/mark/1.0/'
        : '')
    if (
      !/^https?:\/\/creativecommons\.org\/(licenses|publicdomain)\//.test(
        licenseUrl,
      )
    )
      continue
    const sourceUrl = info.descriptionurl
    if (!sourceUrl?.startsWith('https://commons.wikimedia.org/wiki/File:'))
      continue
    const width = info.thumbwidth ?? info.width,
      height = info.thumbheight ?? info.height
    if (Math.min(width, height) < 300 || Math.max(width, height) > 1600)
      continue
    const url = imageUrl(info.thumburl || info.url)
    return {
      url,
      author,
      license,
      licenseUrl: licenseUrl.replace(/^http:/, 'https:'),
      sourceUrl,
      articleTitle: matched.title,
      provider: 'wikimedia-commons',
    }
  }
  return null
}
module.exports = { discoverPhoto, boundedFetch, imageUrl, matchPage }
