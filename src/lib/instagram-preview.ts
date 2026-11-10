import type { InstagramSource } from './instagram'
export interface InstagramPreview {
  source: InstagramSource
  fetchedImages: number
  // `name` is the original extracted name, never overwritten by a user correction.
  // Confirmed country/localized names are intentionally absent from an OCR response.
  result: { places: { name: string; regionHint: string; slides: number[]; evidence: string; needsLocationConfirmation: true; correctedName?: string }[]; ignoredSlides: number[] }
}
export function isInstagramPreview(value: unknown): value is InstagramPreview {
  if (!value || typeof value !== 'object') return false
  const p = value as InstagramPreview
  const validSlide = (n: number) => Number.isInteger(n) && n > 0 && n <= p.fetchedImages
  if (!Number.isInteger(p.fetchedImages) || p.fetchedImages < 1 || p.fetchedImages > 20 ||
    !Array.isArray(p.result?.places) || p.result.places.length > 40 ||
    !Array.isArray(p.result.ignoredSlides) || !p.result.ignoredSlides.every(validSlide)) return false
  if (!p.result.places.every(place => place &&
    typeof place.name === 'string' && place.name.trim().length > 0 && place.name.length <= 200 &&
    typeof place.regionHint === 'string' && place.regionHint.length <= 200 &&
    typeof place.evidence === 'string' && place.evidence.trim().length > 0 && place.evidence.length <= 1000 &&
    place.needsLocationConfirmation === true && Array.isArray(place.slides) && place.slides.length > 0 &&
    place.slides.every(n => validSlide(n) && !p.result.ignoredSlides.includes(n)))) return false
  return new Set([...p.result.ignoredSlides, ...p.result.places.flatMap(place => place.slides)]).size === p.fetchedImages
}
export const importErrorMessages: Record<string, string> = {
  carousel_unavailable: 'Instagram did not provide the carousel. Your link is kept; try again later.',
  partial_carousel: 'Some photos are missing. The post has not been imported.',
  unsupported_video_slide: 'This post includes video. Full video analysis is not supported in this experiment.',
  aws_access_denied: 'The server cannot access the configured AWS model. Your link is kept.',
  aws_model_setup_required: 'The AWS model requires account setup. Complete its provider access requirements in Bedrock, then try again.',
  aws_model_request_invalid: 'The configured AWS model could not accept this request. Check the server model settings.',
  aws_throttled: 'AWS temporarily limited analysis requests. Try again later.',
  analysis_timeout: 'Analysis timed out. No partial results were saved. Your link is kept.',
  session_limit: 'This local test session has reached its three-request limit.',
  busy: 'Another post is being analyzed. Wait for it to finish before trying again.',
  unsupported_media: 'This experiment supports photo posts, not Reels.',
  http_429: 'Instagram limited this request. Try again later.',
  http_403: 'Instagram denied access to this post. No places have been saved.',
  http_404: 'The post could not be retrieved. Check its original link.',
}
