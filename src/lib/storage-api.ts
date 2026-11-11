import type { CoverPhoto } from './place-photo'
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
  coverPhoto?: CoverPhoto
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
  collectionId?: string
  visited: boolean
  bookmarked: boolean
  version: number
  createdAt: string
  updatedAt: string
  sources: Record<string, SavedSource>
}
export interface SavedCollection {
  id: string
  name: string
  version: number
  isDefault: boolean
  createdAt: string
  updatedAt: string
}
const errors: Record<string, string> = {
  collection_name_exists: 'A collection with this name already exists.',
  invalid_collection_name: 'Use a collection name with 1–60 characters.',
  collection_not_found:
    'This collection no longer exists. Refresh your places and choose another collection.',
  collection_conflict:
    'Your collections changed in another session. Refresh your places and try again.',
  default_collection_protected:
    'Saved places is your default collection and cannot be renamed or deleted.',
  collection_limit:
    'You have reached the collection limit. Contact support before adding more collections.',
  collection_migration_limit:
    'Your existing collections need migration assistance. Your saved places are unchanged.',
  photo_not_found: 'Photo unavailable. Please retry later.',
  photos_unavailable: 'Photos are temporarily unavailable. Please retry.',
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
  resource = '/places',
): Promise<T> {
  const owner = getSession()?.sub
  if (!owner) throw new Error('Sign in to save your places.')
  async function send(force = false) {
    if (getSession()?.sub !== owner)
      throw new Error('Your account changed. Please try again.')
    const token = await accessToken(force)
    if (getSession()?.sub !== owner)
      throw new Error('Your account changed. Please try again.')
    return fetch(`${cloudConfig.apiUrl}${resource}${path}`, {
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
  storageRequest<{
    items: SavedPlace[]
    cursor: string | null
    collectionVersion: number
  }>(cursor ? `?cursor=${encodeURIComponent(cursor)}` : '')
export const saveConfirmed = (
  place: ConfirmedPlace,
  note: string,
  collectionId: string,
) =>
  storageRequest<{ item: SavedPlace; duplicate: boolean }>('', 'POST', {
    place,
    note,
    collectionId,
  })
export const patchSaved = (
  place: SavedPlace,
  changes: Partial<
    Pick<
      SavedPlace,
      'note' | 'collection' | 'collectionId' | 'visited' | 'bookmarked'
    >
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
    name: visiblePlaceText(
      item.displayName,
      item.countryCode,
      visiblePlaceText(item.name, item.countryCode),
    ),
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

export const listCollections = () =>
  storageRequest<{ items: SavedCollection[]; version: number }>(
    '',
    'GET',
    undefined,
    '/collections',
  )
export const createCollection = (id: string, name: string) =>
  storageRequest<{ item: SavedCollection }>(
    '',
    'POST',
    { id, name },
    '/collections',
  )
export const renameCollection = (collection: SavedCollection, name: string) =>
  storageRequest<{ item: SavedCollection }>(
    `/${collection.id}`,
    'PATCH',
    { version: collection.version, name },
    '/collections',
  )
export const deleteCollection = (collection: SavedCollection) =>
  storageRequest<{ deleted: boolean }>(
    `/${collection.id}`,
    'DELETE',
    { version: collection.version },
    '/collections',
  )
