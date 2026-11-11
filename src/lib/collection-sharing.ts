import { cloudConfig } from './cloud-auth'
import { storageRequest } from './storage-api'
export interface ShareSettings {
  active: boolean
  token?: string
  expiresAt?: number
}
export interface SharedPlace {
  id: string
  name: string
  address: string
  countryName: string
  coordinates: { longitude: number; latitude: number }
  hasPhoto: boolean
}
export interface SharedCollection {
  name: string
  items: SharedPlace[]
  cursor: string | null
}
export interface SharedPhoto {
  status: string
  imageBase64?: string
  contentType?: string
  attribution?: {
    author: string
    sourceUrl: string
    license: string
    licenseUrl?: string
  }
}
export const shareSettings = (id: string, method = 'GET') =>
  storageRequest<ShareSettings>(
    `/${id}/sharing`,
    method,
    undefined,
    '/collections',
  )
export const shareUrl = (token: string) => `${location.origin}/#share=${token}`
export class ShareUnavailable extends Error {}
export async function readShared<T>(
  token: string,
  path = '',
  signal?: AbortSignal,
): Promise<T> {
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new ShareUnavailable('This sharing link is unavailable.')
  if (!cloudConfig.apiUrl)
    throw new Error('Sharing is not configured on this website.')
  const deadline = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
    : AbortSignal.timeout(20000)
  const send = () =>
    fetch(`${cloudConfig.apiUrl}/shared/${token}${path}`, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      signal: deadline,
    })
  let response = await send()
  for (let retry = 0; response.status === 429 && retry < 2; retry++) {
    await new Promise((resolve) => setTimeout(resolve, 800 * (retry + 1)))
    response = await send()
  }
  if (response.status === 404)
    throw new ShareUnavailable(
      'This link has expired, sharing has stopped, or the collection was deleted.',
    )
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? 'Too many requests. Wait a moment and try again.'
        : 'This collection is temporarily unavailable. The test session may be paused.',
    )
  return response.json() as Promise<T>
}
