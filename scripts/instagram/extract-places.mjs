// Public photo carousel -> source-grounded names; coordinates always come from Places.
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'
import { fetchModelImage } from './model-images.mjs'
import { readSlides } from './read-slides.mjs'
import { readCarousel } from './carousel.mjs'
import { transcribeSlide, interpretTranscripts } from './source-text.mjs'

export async function extractPlaces(shortcode, { onProgress = async () => {} } = {}) {
  if (!shortcode || !/^[A-Za-z0-9_-]{1,64}$/.test(shortcode)) throw new Error('invalid_shortcode')
  const region = process.env.AWS_REGION ?? 'us-east-1'
  const modelId = process.env.PINWISH_BEDROCK_MODEL ?? 'qwen.qwen3-vl-235b-a22b'
  const started = performance.now()
  const signal = AbortSignal.timeout(95000)
  await onProgress({ stage: 'reading_post' })
  const post = await readCarousel(shortcode, { signal })
  const client = new BedrockRuntimeClient({ region, maxAttempts: 2 })
  const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  const addUsage = value => { for (const key of Object.keys(usage)) usage[key] += value?.[key] ?? 0 }
  let totalBytes = 0
  try {
    await onProgress({ stage: 'reading_photos', completed: 0, total: post.images.length })
    const reads = await readSlides(post.images, async (image, imageSignal) => {
      const { bytes, format } = await fetchModelImage(image, { signal: imageSignal })
      totalBytes += bytes.length
      if (totalBytes > 20_000_000) throw new Error('post_too_large')
      return transcribeSlide(client, modelId, { slide: image.slide, bytes, format }, imageSignal)
    }, signal, (completed, total) => onProgress({ stage: 'reading_photos', completed, total }))
    const transcripts = reads.map(read => read.transcript)
    reads.forEach(read => addUsage(read.usage))
    await onProgress({ stage: 'identifying_places' })
    const interpreted = await interpretTranscripts(client, modelId, transcripts, post.caption, signal)
    addUsage(interpreted.usage)
    return { checkedAt: new Date().toISOString(), shortcode, region, modelId,
      method: 'experimental_public_html_then_bedrock', fetchedImages: post.images.length,
      modelRequests: reads.reduce((sum, read) => sum + read.requests, 0) + interpreted.requests, usage, elapsedMs: Math.round(performance.now() - started),
      automaticAccuracyVerified: false, result: interpreted.result }
  } finally { client.destroy() }
}
