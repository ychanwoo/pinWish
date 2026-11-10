import { visiblePlaceText } from './place-name'
import {
  accessToken,
  cloudConfig,
  getSession,
  expireSession,
} from './cloud-auth'
import type { ConfirmedPlace } from './place-search'
export interface SavedSource {
  originalUrl: string
  canonicalUrl: string
  slides: number[]
  extractedName: string
  correctedName?: string
  evidence: string
}
export interface SavedPlace {
  id: string
  provider: string
  placeId: string
  name: string
  displayName: string
  address: string
  countryCode: string
  countryName: string
  coordinates: { longitude: number; latitude: number }
  placeType: string
  note: string
  collection: string
  visited: boolean
  bookmarked: boolean
  version: number
  createdAt: string
  updatedAt: string
  sources: Record<string, SavedSource>
}
const errors: Record<string, string> = {
  conflict:
    'This place changed in another session. Refresh your places and try again.',
  unauthorized: 'Your session expired. Please sign in again.',
  storage_unavailable:
    'Saving is temporarily unavailable. Your draft is kept; try again.',
  source_limit: 'This place has reached the limit of 30 source entries.',
  not_found: 'This place was not found. Refresh your places.',
  invalid_input: 'Check your input and try again.',
}
export async function storageRequest<T>(
  path: string,
  method = 'GET',
  body?: unknown,
): Promise<T> {
  const owner = getSession()?.sub
  if (!owner) throw new Error('Sign in to save your places.')
  async function send(force = false) {
    if (getSession()?.sub !== owner)
      throw new Error('Your account changed. Please try again.')
    const token = await accessToken(force)
    if (getSession()?.sub !== owner)
      throw new Error('Your account changed. Please try again.')
    return fetch(`${cloudConfig.apiUrl}/places${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    })
  }
  let r = await send()
  if (r.status === 401) r = await send(true)
  if (getSession()?.sub !== owner)
    throw new Error('Your account changed. Please try again.')
  for (let retry = 0; r.status === 429 && retry < 2; retry++) {
    await new Promise((resolve) => setTimeout(resolve, 800 * (retry + 1)))
    r = await send()
  }
  if (r.status === 401) {
    expireSession()
    throw new Error('Your session expired. Please sign in again.')
  }
  if (getSession()?.sub !== owner)
    throw new Error('Your account changed. Please try again.')
  const data = await r.json()
  if (!r.ok)
    throw new Error(
      errors[data.code] ??
        (r.status === 429
          ? 'Too many requests. Wait a moment and retry.'
          : 'Unable to complete the request. Your draft is kept.'),
    )
  return data as T
}
export const listSaved = (cursor: string | null) =>
  storageRequest<{ items: SavedPlace[]; cursor: string | null }>(
    cursor ? `?cursor=${encodeURIComponent(cursor)}` : '',
  )
export const saveConfirmed = (
  place: ConfirmedPlace,
  note: string,
  collection: string,
) =>
  storageRequest<{ item: SavedPlace; duplicate: boolean }>('', 'POST', {
    place,
    note,
    collection,
  })
export const patchSaved = (
  place: SavedPlace,
  changes: Partial<
    Pick<SavedPlace, 'note' | 'collection' | 'visited' | 'bookmarked'>
  >,
) =>
  storageRequest<{ item: SavedPlace }>(`/${place.id}`, 'PATCH', {
    version: place.version,
    ...changes,
  })
export const deleteSaved = (place: SavedPlace) =>
  storageRequest(`/${place.id}`, 'DELETE', { version: place.version })

export function toUIPlace(item: SavedPlace): import('../data/places').Place {
  return {
    id: item.id,
    name: visiblePlaceText(item.displayName, item.countryCode, visiblePlaceText(item.name, item.countryCode)),
    kind: item.placeType === 'PointOfInterest' ? 'Saved place' : item.placeType,
    district: item.countryName,
    category: 'Other',
    visited: item.visited,
    badge: item.visited ? 'Visited' : 'Unvisited',
    note: item.note,
    photo: 'place-placeholder.svg',
    address: item.address,
    collection: item.collection,
    bookmarked: item.bookmarked,
    tags: [],
    saved: item,
  }
}
