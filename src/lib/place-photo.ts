import { storageRequest, type SavedPlace } from './storage-api'
import { getSession, subscribeSession } from './cloud-auth'
export interface CoverPhoto {
  objectKey: string
  contentType: 'image/jpeg'
  width: number
  height: number
  bytes: number
  updatedAt: string
  author: string
  sourceUrl: string
  license: string
  licenseUrl?: string
  provider?: string
}
async function fetchPhoto(id: string) {
  const result = await storageRequest<{
    status: 'pending' | 'ready' | 'not_found' | 'unavailable'
    item: SavedPlace
    imageBase64?: string
    contentType?: string
    objectKey?: string
  }>(`/${id}/photo`)
  if (
    !result.item ||
    result.item.id !== id ||
    !['ready', 'pending', 'not_found', 'unavailable'].includes(result.status)
  )
    throw new Error('Photo temporarily unavailable.')
  if (result.status !== 'ready') return { ...result, url: '' }
  if (
    result.contentType !== 'image/jpeg' ||
    !result.imageBase64 ||
    result.imageBase64.length > 2_800_000 ||
    !result.objectKey ||
    result.objectKey !== result.item.coverPhoto?.objectKey
  )
    throw new Error('Could not load this photo. Please retry.')
  let url = ''
  try {
    const bytes = Uint8Array.from(atob(result.imageBase64), (c) => c.charCodeAt(0))
    url = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }))
    const image = new Image()
    image.src = url
    await image.decode()
    return { ...result, url }
  } catch {
    if (url) URL.revokeObjectURL(url)
    throw new InvalidPhotoError('Could not display this photo.')
  }
}

class InvalidPhotoError extends Error {}

type PhotoResult = Awaited<ReturnType<typeof fetchPhoto>>
const cache = new Map<
  string,
  { result: PhotoResult; expires: number; bytes: number }
>()
const pending = new Map<string, Promise<PhotoResult>>()
let sessionGeneration = 0
let cacheOwner = getSession()?.sub
const revisions = new Map<string, number>()
export function forgetPhoto(id: string) {
  const entry = cache.get(id)
  if (entry?.result.url) URL.revokeObjectURL(entry.result.url)
  cache.delete(id)
  pending.delete(id)
  revisions.set(id, (revisions.get(id) ?? 0) + 1)
}
function syncOwner() {
  if (cacheOwner === getSession()?.sub) return
  for (const entry of cache.values())
    if (entry.result.url) URL.revokeObjectURL(entry.result.url)
  sessionGeneration++
  cache.clear()
  pending.clear()
  cacheOwner = getSession()?.sub
}
subscribeSession(syncOwner)
export function cachedPhoto(id: string) {
  syncOwner()
  const entry = cache.get(id)
  return entry && entry.expires > Date.now() ? entry.result : undefined
}
function photoExpiry(result: PhotoResult) {
  if (result.status === 'ready') return Date.now() + 600000
  if (result.status === 'pending') return Date.now() + 1500
  const fallback = result.status === 'not_found' ? 86400000 : 3000
  const now = Date.now()
  return Math.max(now + 1000, result.item.photoLookup?.retryAt ?? now + fallback)
}
export function photoRetryDelay(id: string) {
  return Math.max(0, (cache.get(id)?.expires ?? Date.now()) - Date.now())
}
export async function loadPhoto(
  id: string,
  force = false,
): Promise<PhotoResult> {
  syncOwner()
  if (!getSession()) throw new Error('Sign in to view photos.')
  const active = pending.get(id)
  if (active) return active
  const hit = cachedPhoto(id)
  // Even an explicit retry cannot start discovery before the server lease ends.
  if (hit && (!force || hit.status === 'not_found' || hit.status === 'unavailable')) return hit
  const owner = cacheOwner
  const revision = revisions.get(id) ?? 0
  const generation = sessionGeneration
  const current = () =>
    generation === sessionGeneration && getSession()?.sub === owner &&
    (revisions.get(id) ?? 0) === revision
  // Transport retries already happen inside storageRequest. Replay only a bad
  // image payload here, inside the promise shared by prefetch and the dossier.
  const request = fetchPhoto(id)
    .catch((error) => {
      if (!(error instanceof InvalidPhotoError) || !current()) throw error
      return fetchPhoto(id)
    })
    .then((result) => {
      if (!current()) {
        if (result.url) URL.revokeObjectURL(result.url)
        throw new Error('Your account changed.')
      }
      const old = cache.get(id)
      if (old?.result.url && old.result.url !== result.url)
        URL.revokeObjectURL(old.result.url)
      cache.delete(id)
      // Keep private photos in bounded session memory, never localStorage.
      const { imageBase64: _base64, ...light } = result
      cache.set(id, {
        result: light,
        bytes: result.item.coverPhoto?.bytes ?? 0,
        expires: photoExpiry(result),
      })
      let total = [...cache.values()].reduce((n, e) => n + e.bytes, 0)
      for (const [key, entry] of cache) {
        if (cache.size <= 40 && total <= 24 * 1024 * 1024) break
        if (key === id) continue
        total -= entry.bytes
        if (entry.result.url) URL.revokeObjectURL(entry.result.url)
        cache.delete(key)
      }
      return light
    })
    .finally(() => {
      if (pending.get(id) === request) pending.delete(id)
    })
  pending.set(id, request)
  return request
}
export function prefetchPhotos(ids: string[]) {
  const generation = sessionGeneration
  const queue = [...new Set(ids)].slice(0, 12).map((id) => ({
    id,
    due: 0,
    polls: 0,
    retriedUnavailable: false,
  }))
  let cancelled = false
  let timer: ReturnType<typeof setTimeout>
  function schedule(delay: number) {
    if (cancelled || generation !== sessionGeneration || !queue.length) return
    queue.sort((a, b) => a.due - b.due)
    timer = setTimeout(next, Math.max(delay, queue[0].due - Date.now()))
  }
  async function next() {
    if (cancelled || generation !== sessionGeneration) return
    const task = queue.shift()
    if (!task) return
    try {
      const result = await loadPhoto(task.id)
      if (result.status === 'pending' && task.polls < 5) {
        task.polls++
        task.due = Date.now() + 3000
        queue.push(task)
      } else if (result.status === 'unavailable' && !task.retriedUnavailable) {
        task.retriedUnavailable = true
        task.due = Date.now() + photoRetryDelay(task.id) + 10
        queue.push(task)
      }
    } catch {
      // The shared read already exhausted its retries. Leave the place usable.
    }
    schedule(700)
  }
  schedule(0)
  return () => {
    cancelled = true
    clearTimeout(timer)
  }
}
