export type Category = 'Food' | 'Coffee' | 'Culture'
export interface Place {
  id: string
  name: string
  kind: string
  district: string
  category: Category
  visited: boolean
  badge: string
  note: string
  photo: string
  address: string
  collection: string
  bookmarked: boolean
  tags?: string[]
}
export const asset = (file: string) => `/assets/figma/${file}`
export const initialPlaces: Place[] = [
  {
    id: 'grand-central',
    name: 'Grand Central Market',
    kind: 'Historic Food Hall',
    district: 'DTLA',
    category: 'Food',
    visited: true,
    badge: 'Visited',
    note: 'Try the carnitas at Villa Morelianas. Great coffee at G&B near the hill street entrance.',
    photo: 'be729.png',
    address: '317 S Broadway, Los Angeles, CA 90013',
    collection: 'LA weekend',
    bookmarked: true,
  },
  {
    id: 'maru',
    name: 'Maru Coffee',
    kind: 'Specialty Coffee',
    district: 'Arts District',
    category: 'Coffee',
    visited: false,
    badge: 'Must try',
    note: 'Order the Cream Top espresso or iced matcha. Go early for a seat.',
    photo: 'e4163.png',
    address: '1019 S Santa Fe Ave, Los Angeles, CA',
    collection: 'LA weekend',
    bookmarked: true,
  },
  {
    id: 'broad',
    name: 'The Broad',
    kind: 'Contemporary Art',
    district: 'Grand Ave',
    category: 'Culture',
    visited: false,
    badge: 'Free tickets online',
    note: 'Reserve Infinity Mirror Rooms reservation queue right upon entry on the mobile kiosk.',
    photo: '3f9d8.png',
    address: '221 S Grand Ave, Los Angeles, CA',
    collection: 'LA weekend',
    bookmarked: true,
  },
  {
    id: 'gjusta',
    name: 'Gjusta',
    kind: 'Bakery & Deli',
    district: 'Venice',
    category: 'Food',
    visited: true,
    badge: 'Visited',
    note: 'Smoked fish plate with seeded rye and house-made pickles in the rear garden patio.',
    photo: '2b5ee.png',
    address: '320 Sunset Ave, Venice, CA',
    collection: 'LA weekend',
    bookmarked: true,
  },
  {
    id: 'hauser',
    name: 'Hauser & Wirth',
    kind: 'Art Gallery & Garden',
    district: 'Arts District',
    category: 'Culture',
    visited: true,
    badge: 'Free admission',
    note: 'Check out the chicken coop and garden courtyard before grabbing drinks at Manuela…',
    photo: '0a618.png',
    address: '901 E 3rd St, Los Angeles, CA',
    collection: 'LA weekend',
    bookmarked: true,
  },
]
export const saveStates = [
  'entry',
  'resolving',
  'ready',
  'invalid',
  'not_found',
  'lookup_error',
  'saving',
  'save_error',
  'duplicate',
  'success',
] as const
export type SaveState = (typeof saveStates)[number]
export type View =
  'list' | 'map' | 'detail' | 'empty' | 'saved' | 'list_loading' | 'list_error'
export const sampleLink = 'https://www.instagram.com/p/example/'
export function resolveSample(input: string): Place | undefined {
  const normalized = input.toLowerCase()
  if (
    normalized === sampleLink ||
    normalized === 'https://maps.app.goo.gl/grandcentral'
  )
    return initialPlaces[0]
  return initialPlaces.find((place) =>
    normalized.includes(place.name.toLowerCase()),
  )
}
export function validInput(input: string): boolean {
  const trimmed = input.trim()
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed)
      return url.hostname.includes('.') && url.protocol === 'https:'
    } catch {
      return false
    }
  }
  return (
    /\d+\s+\S+/.test(trimmed) ||
    initialPlaces.some((place) =>
      trimmed.toLowerCase().includes(place.name.toLowerCase()),
    )
  )
}

export function inCollection(place: Place, collection: string): boolean {
  return collection === 'Coffee'
    ? place.category === 'Coffee'
    : collection === 'Galleries'
      ? place.category === 'Culture'
      : place.collection === collection
}
export function placeTags(place: Place): string[] {
  return (
    place.tags ??
    (place.id.split(':')[0] === 'grand-central'
      ? ['foodhall', 'tacos', 'coffee', 'dtla', 'historic']
      : [
          place.category.toLowerCase(),
          place.district.toLowerCase().replaceAll(' ', '-'),
        ])
  )
}
export function matchesPlace(place: Place, search: string): boolean {
  return `${place.name} ${place.kind} ${place.district} ${place.note} ${placeTags(place).join(' ')}`
    .toLowerCase()
    .includes(search.trim().toLowerCase().replace(/^#/, ''))
}
