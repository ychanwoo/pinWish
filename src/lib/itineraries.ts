import { storageRequest } from './storage-api'
export interface TripStopInput {
  id: string
  duration: number
  manual?: { open: string; close: string; days: number[] }
}
export interface TripSettings {
  date: string
  start: string
  end: string
  days: number
  mode: 'Car' | 'Pedestrian'
  order: 'recommended' | 'manual'
  stops: TripStopInput[]
}
export interface TripPlace {
  id: string
  name: string
  address: string
  coordinates: { longitude: number; latitude: number }
  suggestedDuration: number
  hours: { status: string; display: string[] }
  zone: string
}
export interface TripContext {
  contextId: string
  places: TripPlace[]
  zone: string
  checkedAt: string
}
export interface ScheduledStop {
  id: string
  name: string
  address: string
  coordinates: { longitude: number; latitude: number }
  arrival: number
  departure: number
  duration: number
  travel: number
  wait: number
  hoursSource: string
  hours: string[]
}
export interface TripPlan {
  days: { date: string; stops: ScheduledStop[] }[]
  unscheduled: { id: string; name: string; reason: string }[]
  complete: boolean
  dayCount: number
  nights: number
}
export interface TripPreview {
  previewId: string
  settings: TripSettings
  plan: TripPlan
  zone: string
  checkedAt: string
}
export interface SavedTrip extends Omit<TripPreview, 'previewId'> {
  id: string
  collectionId: string
  name: string
  version: number
  updatedAt: string
  share: { token: string; expiresAt: number } | null
}
export const tripAPI = <T>(path: string, method = 'GET', body?: unknown) =>
  storageRequest<T>(path, method, body, '')
export const tripTime = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
export const tripDate = (date: string) =>
  new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
