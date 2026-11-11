import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
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
execFileSync('zip', ['-j', '-q', '../processing.zip', 'index.js'], {
  cwd: 'infra/generated/processing',
})
const bytes = await readFile('infra/generated/processing.zip')
const key = `deployments/processing-${createHash('sha256').update(bytes).digest('hex').slice(0, 20)}.zip`
await writeFile(
  'infra/generated/processing-artifact.json',
  JSON.stringify({ key, bytes: bytes.length }),
)
console.log(`Built processing artifact (${bytes.length} bytes)`)
