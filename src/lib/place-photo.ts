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
    result.objectKey !== result.item.coverPhoto?.objectKey
  )
    throw new Error('Could not load this photo. Please retry.')
  const bytes = Uint8Array.from(atob(result.imageBase64), (c) =>
    c.charCodeAt(0),
  )
  return {
    ...result,
    url: URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' })),
  }
}

type PhotoResult = Awaited<ReturnType<typeof fetchPhoto>>
const cache = new Map<
  string,
  { result: PhotoResult; expires: number; bytes: number }
>()
const pending = new Map<string, Promise<PhotoResult>>()
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
export async function loadPhoto(
  id: string,
  force = false,
): Promise<PhotoResult> {
  syncOwner()
  if (!getSession()) throw new Error('Sign in to view photos.')
  const hit = !force && cachedPhoto(id)
  if (hit) return hit
  const active = pending.get(id)
  if (active) return active
  const owner = cacheOwner
  const revision = revisions.get(id) ?? 0
  const request = fetchPhoto(id)
    .then((result) => {
      if (getSession()?.sub !== owner || (revisions.get(id) ?? 0) !== revision) {
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
        expires:
          Date.now() +
          (result.status === 'ready'
            ? 600000
            : result.status === 'pending'
              ? 1500
              : 10000),
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
  let cancelled = false
  const owner = getSession()?.sub
  const wait = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms))
  void (async () => {
    let remaining = ids.slice(0, 12)
    for (let round = 0; round < 6 && remaining.length; round++) {
      const retry: string[] = []
      for (const id of remaining) {
        if (cancelled || getSession()?.sub !== owner) return
        try {
          const result = await loadPhoto(id)
          if (result.status === 'pending') retry.push(id)
        } catch {
          /* Detail view offers retry; list remains usable. */
        }
        await wait(700)
      }
      remaining = retry
      if (remaining.length) await wait(3000)
    }
  })()
  return () => {
    cancelled = true
  }
}
