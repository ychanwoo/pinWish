// Loopback-only development API. Production requires authentication and per-user quotas.
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import { parseInstagramLink } from '../../src/lib/instagram.ts'
import { importErrorCode } from './errors.mjs'
import { extractPlaces } from './extract-places.mjs'
import { createPlaceService, placeError } from '../places/service.mjs'

export function createDevServer({ extract = extractPlaces, placeService = createPlaceService(), importLimit = 3, placesLimit = 100, runtimeAllowed = () => true } = {}) {
  let activeImport = false, importAttempts = 0, activePlaces = 0, placeAttempts = 0
  const server = createServer(async (req, res) => {
    const reply = (status, data) => {
      if (res.destroyed || res.writableEnded) return
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
      res.end(JSON.stringify(data))
    }
    if (!runtimeAllowed()) return reply(503, { code: 'processing_unavailable' })
    const isImport = req.url === '/api/instagram/preview'
    const operation = req.url === '/api/places/search' ? 'search' : req.url === '/api/places/details' ? 'details' : null
    if (req.method !== 'POST' || (!isImport && !operation)) return reply(404, { code: 'not_found' })
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host ?? '')) return reply(403, { code: 'forbidden_host' })
    if ((req.headers.origin && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(req.headers.origin)) || req.headers['sec-fetch-site'] === 'cross-site') return reply(403, { code: 'forbidden_origin' })
    if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') return reply(415, { code: 'json_required' })
    let bytes = 0
    const chunks = []
    try {
      for await (const chunk of req) {
        bytes += chunk.length
        if (bytes > 4096) return reply(413, { code: 'input_too_large' })
        chunks.push(chunk)
      }
      let payload
      try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return reply(400, { code: 'invalid_json' }) }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return reply(400, { code: 'invalid_request' })
      if (isImport) {
        if (typeof payload.input !== 'string') return reply(400, { code: 'invalid_url' })
        const parsed = parseInstagramLink(payload.input)
        if (!parsed.ok) return reply(400, { code: parsed.code })
        if (parsed.source.kind !== 'p') return reply(422, { code: 'unsupported_media' })
        if (activeImport || importAttempts >= importLimit) return reply(429, { code: activeImport ? 'busy' : 'session_limit' })
        activeImport = true; importAttempts += 1
        try { reply(200, { source: parsed.source, ...await extract(parsed.source.shortcode) }) }
        catch (error) { reply(502, { code: importErrorCode(error) }) }
        finally { activeImport = false }
      } else {
        if (activePlaces >= 2 || placeAttempts >= placesLimit) return reply(429, { code: activePlaces >= 2 ? 'places_busy' : 'places_session_limit' })
        activePlaces += 1; placeAttempts += 1
        const controller = new AbortController()
        const disconnect = () => { if (!res.writableEnded) controller.abort() }
        res.on('close', disconnect)
        try { reply(200, await placeService[operation](payload, controller.signal)) }
        catch (error) { const failure = placeError(error); reply(failure.status, { code: failure.code }) }
        finally { activePlaces -= 1; res.off('close', disconnect) }
      }
    } catch { reply(400, { code: 'invalid_request' }) }
  })
  server.requestTimeout = 15000
  server.on('close', () => placeService.close())
  return server
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let window
  try { window = JSON.parse(readFileSync('.aws-runtime.local', 'utf8')) } catch {}
  const remaining = Date.parse(window?.until ?? '') - Date.now()
  if (!window?.enabled || !(remaining > 0 && remaining <= 120 * 60000)) {
    console.error('AWS test window is closed. Run npm run cloud:test:start first, or use the deployed processing API.')
    process.exit(1)
  }
  const server = createDevServer({runtimeAllowed: () => {
    try { const current = JSON.parse(readFileSync('.aws-runtime.local', 'utf8')); return current.enabled && Date.parse(current.until) > Date.now() } catch { return false }
  }}).listen(8787, '127.0.0.1', () => console.log('PinWish local API: 127.0.0.1:8787; closes at ' + window.until))
  const timer = setTimeout(() => { server.close(); server.closeAllConnections() }, remaining)
  server.on('close', () => clearTimeout(timer))
}
