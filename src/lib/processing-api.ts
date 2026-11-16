import { accessToken, getSession, expireSession } from './cloud-auth'
export interface ImportProgress {
  stage: 'reading_post' | 'reading_photos' | 'identifying_places'
  completed?: number
  total?: number
}
export function isImportProgress(value: unknown): value is ImportProgress {
  if (!value || typeof value !== 'object') return false
  const p = value as ImportProgress
  if (p.stage === 'reading_post' || p.stage === 'identifying_places') return true
  return p.stage === 'reading_photos' && Number.isInteger(p.completed) && Number.isInteger(p.total) &&
    p.total! > 0 && p.total! <= 20 && p.completed! >= 0 && p.completed! <= p.total!
}
const api = (import.meta.env.VITE_PROCESSING_API_URL ?? '').replace(/\/$/, '')
export const cloudProcessing = Boolean(api)
export async function processingRequest(
  path: string,
  init: RequestInit,
  onProgress?: (progress: ImportProgress) => void,
): Promise<Response> {
  if (!api) return fetch(path, init)
  const owner = getSession()?.sub
  const error = (code: string, status = 503) =>
    new Response(JSON.stringify({ code }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  if (!owner) return error('unauthorized', 401)
  const signal = init.signal ?? AbortSignal.timeout(155000)
  async function send(suffix: string, body?: object) {
    let refresh = false
    for (let attempt = 0; attempt < 3; attempt++) {
      signal.throwIfAborted()
      if (getSession()?.sub !== owner)
        throw new Error('Your account changed. Please sign in again.')
      const token = await accessToken(refresh)
      let response: Response
      try {
        const incoming = await fetch(api + '/jobs' + suffix, {
          method: body ? 'POST' : 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
        })
        // Fetch resolves at headers: include body transfer in the same retry
        // boundary so a dropped polling response can resume the existing job.
        const text = await incoming.text()
        if (incoming.ok) JSON.parse(text)
        response = new Response(text, { status: incoming.status, headers: incoming.headers })
      } catch (failure) {
        if (signal.aborted) throw failure
        if (attempt === 2) return error(failure instanceof SyntaxError ? 'processing_invalid_response' : 'processing_connection_failed')
        await delay(1000 * (attempt + 1))
        continue
      }
      if (response.status === 401 && !refresh) {
        refresh = true
        continue
      }
      if (response.status === 429 && attempt < 2) {
        const detail = await response
          .clone()
          .json()
          .catch(() => null)
        if (detail?.code === 'daily_limit') return response
        await delay(1000 * (attempt + 1))
        continue
      }
      if (getSession()?.sub !== owner) throw new Error('Your account changed.')
      if (response.status === 401) expireSession()
      return response
    }
    return error('processing_unavailable')
  }
  function delay(ms: number) {
    return new Promise<void>((resolve, reject) => {
      signal.throwIfAborted()
      const abort = () => {
        clearTimeout(timer)
        reject(signal.reason)
      }
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', abort)
        resolve()
      }, ms)
      signal.addEventListener('abort', abort, { once: true })
    })
  }
  const operation =
    path === '/api/instagram/preview' ? 'import' : path.split('/').at(-1)
  const id = crypto.randomUUID(),
    payload = JSON.parse(String(init.body))
  const started = await send('', { id, operation, payload })
  if (!started.ok) return started
  await started.body?.cancel() // Acknowledgement only; the result is read through polling.
  for (let attempt = 0; attempt < 70; attempt++) {
    await delay(operation === 'import' ? 2000 : 750)
    const response = await send('/' + id)
    if (!response.ok) return response
    const job = await response.json()
    if (job.id !== id) return error('invalid_job')
    if (!signal.aborted && getSession()?.sub === owner && isImportProgress(job.progress))
      onProgress?.(job.progress)
    if (job.status === 'complete')
      return new Response(JSON.stringify(job.result), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Pinwish-Job': id,
        },
      })
    if (job.status === 'failed')
      return error(job.code ?? 'processing_unavailable')
  }
  return error('processing_timeout', 504)
}
