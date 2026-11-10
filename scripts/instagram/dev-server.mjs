// Local diagnostic server only. Do not expose publicly or deploy without authentication.
import { createServer } from 'node:http'
import { parseInstagramLink } from '../../src/lib/instagram.ts'
import { importErrorCode } from './errors.mjs'
import { extractPlaces } from './extract-places.mjs'
let active = false
let attempts = 0
const server = createServer(async (req, res) => {
  const reply = (status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(data))
  }
  if (req.url !== '/api/instagram/preview' || req.method !== 'POST') return reply(404, { code: 'not_found' })
  const origin = req.headers.origin
  if (origin && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return reply(403, { code: 'forbidden_origin' })
  if (!req.headers['content-type']?.startsWith('application/json')) return reply(415, { code: 'json_required' })
  if (active || attempts >= 3) return reply(429, { code: active ? 'busy' : 'session_limit' })
  let body = ''
  try {
    for await (const chunk of req) {
      body += chunk.toString()
      if (Buffer.byteLength(body) > 4096) return reply(413, { code: 'input_too_large' })
    }
    let payload
    try { payload = JSON.parse(body) } catch { return reply(400, { code: 'invalid_json' }) }
    if (!payload || typeof payload.input !== 'string') return reply(400, { code: 'invalid_url' })
    const parsed = parseInstagramLink(payload.input)
    if (!parsed.ok) return reply(400, { code: parsed.code })
    if (parsed.source.kind !== 'p') return reply(422, { code: 'unsupported_media' })
    // Recheck after reading the request body to prevent a concurrency race.
    if (active || attempts >= 3) return reply(429, { code: active ? 'busy' : 'session_limit' })
    active = true
    attempts += 1
    try {
      const report = await extractPlaces(parsed.source.shortcode)
      reply(200, { source: parsed.source, ...report })
    } catch (error) {
      const code = importErrorCode(error)
      reply(502, { code })
    } finally { active = false }
  } catch { if (!res.headersSent) reply(400, { code: 'invalid_request' }) }
})
server.requestTimeout = 15000
server.listen(8787, '127.0.0.1', () => console.log('PinWish experimental import API: 127.0.0.1:8787 (3 attempts per process; AWS Bedrock charges apply)'))
