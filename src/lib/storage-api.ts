import { placeKind } from './place-presentation'
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
  searchOrigin?: { query: string; region: string }
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
  details_limit: 'Place details refresh limit reached. Please try again later.',
  details_unavailable: 'Could not refresh place details. Please retry in a few minutes.',
  map_preferences_conflict: 'Map colors changed in another tab. The latest colors have been loaded; choose again.',
  invalid_map_preferences: 'Choose one of the available map colors.',
  invalid_trip_date: 'Choose a valid travel start date.',
  invalid_trip_time: 'Use a valid time for your day and opening hours.',
  invalid_trip_day: 'Plan 2–14 hours per day, between 06:00 and 23:00.',
  invalid_trip_days: 'Choose 1–7 days or let us recommend the duration.',
  select_three_to_twenty_places: 'Choose between 3 and 20 places.',
  invalid_visit_duration: 'Visit lengths must be between 15 minutes and 10 hours.',
  invalid_manual_hours: 'Select open weekdays and a closing time after opening.',
  itinerary_timezone_missing: 'A place has no reliable time zone. Remove it and try again.',
  itinerary_multiple_timezones: 'Plan one time zone at a time. Split these places into separate trips.',
  itinerary_places_changed: 'A selected place changed or moved. Reopen the planner and select your places again.',
  itinerary_context_expired: 'Opening hours need refreshing. Go back to Choose places and review hours again.',
  itinerary_provider_unavailable: 'Could not retrieve opening hours or routes. Your choices are kept; try again.',
  itinerary_provider_busy: 'The map provider is busy. Wait a moment and retry.',
  itinerary_limit: 'The trip lookup limit has been reached. Try again later; existing saved trips remain available.',
  itinerary_incomplete: 'Resolve the unscheduled places before saving.',
  itinerary_conflict: 'This journey changed in another tab. Reopen it before making changes.',
  itinerary_not_found: 'This journey is no longer available.',
  invalid_itinerary_name: 'Use a journey name with 1–80 characters.',

  selection_expired:
    'This search result expired. Search again and select the place.',
  invalid_selection: 'Select a search result before saving.',
  english_name_unavailable:
    'An English place name is unavailable. Try a more specific search.',
  collection_name_exists: 'A collection with this name already exists.',
  invalid_collection_name: 'Use a collection name with 1–60 characters.',
  collection_not_found:
    'This collection no longer exists. Refresh your places and choose another collection.',
  collection_conflict:
    'Your collections changed in another session. Refresh your places and try again.',
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
    kind: placeKind(item.placeType),
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
  storageRequest<{ deleted: boolean; defaultCollection: SavedCollection }>(
    `/${collection.id}`,
    'DELETE',
    { version: collection.version },
    '/collections',
  )

export const saveDirectPlace = (
  detailsJobId: string,
  query: string,
  region: string,
  note: string,
  collectionId: string,
) =>
  storageRequest<{ item: SavedPlace; duplicate: boolean }>('', 'POST', {
    directSearch: { detailsJobId, query, region },
    note,
    collectionId,
  })
