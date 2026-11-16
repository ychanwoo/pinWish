import { boundedFetch } from './carousel.mjs'

// Read dimensions without allocating a decoded, potentially very large bitmap.
export function imageDimensions(bytes, format) {
  if (format === 'png' && bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
  if (format !== 'jpeg' || bytes.length < 4 || bytes.readUInt16BE(0) !== 0xffd8) return null
  let offset = 2
  while (offset + 4 <= bytes.length) {
    if (bytes[offset++] !== 0xff) return null
    while (bytes[offset] === 0xff) offset++
    const marker = bytes[offset++]
    if (marker === 0xda || marker === 0xd9) return null
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    if (offset + 2 > bytes.length) return null
    const length = bytes.readUInt16BE(offset)
    if (length < 2 || offset + length > bytes.length) return null
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
      if (length < 7) return null
      return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) }
    }
    offset += length
  }
  return null
}

export async function fetchModelImage(image, { signal, fetchImage = boundedFetch } = {}) {
  const original = await fetchImage(image.url, { image: true, signal })
  const size = imageDimensions(original.bytes, original.format)
  if (!size?.width || !size.height || Math.max(size.width, size.height) <= 2048) return original
  const ratio = size.width / size.height
  // Only provider-supplied variants; never rewrite a signed CDN URL or crop a slide.
  for (const url of (image.alternatives ?? []).slice(0, 3)) {
    signal?.throwIfAborted()
    try {
      const variant = await fetchImage(url, { image: true, signal })
      const dimensions = imageDimensions(variant.bytes, variant.format)
      if (dimensions && Math.min(dimensions.width, dimensions.height) >= 1000 &&
          Math.max(dimensions.width, dimensions.height) <= 2048 &&
          Math.abs(dimensions.width / dimensions.height - ratio) / ratio < 0.02 &&
          variant.bytes.length < original.bytes.length) return variant
    } catch (error) {
      if (signal?.aborted) throw error
      // An unavailable variant must not discard an otherwise valid original.
    }
  }
  return original
}
