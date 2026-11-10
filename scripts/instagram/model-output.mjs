import { validateExtraction } from './carousel.mjs'

export function imageBatches(images) {
  const batches = []
  let batch = [], bytes = 0
  for (const image of images) {
    if (batch.length && (batch.length === 3 || bytes + image.bytes.length > 3_500_000)) {
      batches.push(batch); batch = []; bytes = 0
    }
    batch.push(image); bytes += image.bytes.length
  }
  if (batch.length) batches.push(batch)
  return batches
}

export function parseBatchResponse(response, slides) {
  if (response.stopReason !== 'end_turn') throw new Error('model_output_incomplete')
  const text = response.output?.message?.content?.map(block => block.text ?? '').join('') ?? ''
  let parsed
  try { parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '').trim()) }
  catch { throw new Error('invalid_model_json') }
  // Batch-local validation must reject foreign slide numbers, not silently remap them.
  const local = n => slides.includes(n) ? slides.indexOf(n) + 1 : 0
  if (!parsed || !Array.isArray(parsed.places) || !Array.isArray(parsed.ignoredSlides)) throw new Error('invalid_model_output')
  const result = validateExtraction({
    places: parsed.places.map(p => ({ ...p, slides: Array.isArray(p?.slides) ? p.slides.map(local) : [] })),
    ignoredSlides: parsed.ignoredSlides.map(local),
  }, slides.length)
  return {
    places: result.places.map(p => ({ ...p, slides: p.slides.map(n => slides[n - 1]) })),
    ignoredSlides: result.ignoredSlides.map(n => slides[n - 1]),
  }
}
