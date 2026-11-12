import { build } from 'esbuild'
import { mkdir, readFile, writeFile, chmod, utimes, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
await mkdir('infra/generated/processing', { recursive: true })
await build({
  entryPoints: ['backend/processing.mjs'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  minify: true,
  outfile: 'infra/generated/processing/index.js',
})
// Stable ZIP metadata prevents identical code from producing a new S3 key.
const entry = 'infra/generated/processing/index.js'
await chmod(entry, 0o644)
const epoch = new Date('1980-01-01T00:00:00Z')
await utimes(entry, epoch, epoch)
await rm('infra/generated/processing.zip', { force: true })
execFileSync('zip', ['-X', '-j', '-q', '../processing.zip', 'index.js'], {
  cwd: 'infra/generated/processing',
  env: { ...process.env, TZ: 'UTC' },
})
const bytes = await readFile('infra/generated/processing.zip')
const key = `deployments/processing-${createHash('sha256').update(bytes).digest('hex').slice(0, 20)}.zip`
await writeFile(
  'infra/generated/processing-artifact.json',
  JSON.stringify({ key, bytes: bytes.length }),
)
console.log(`Built processing artifact (${bytes.length} bytes)`)
