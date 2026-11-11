import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
const stack = process.argv[2] ?? 'pinwish-storage-dev'
const region = process.env.AWS_REGION ?? 'us-east-1'
const outputs = JSON.parse(
  execFileSync(
    'aws',
    [
      'cloudformation',
      'describe-stacks',
      '--stack-name',
      stack,
      '--region',
      region,
      '--query',
      'Stacks[0].Outputs',
      '--output',
      'json',
    ],
    { encoding: 'utf8' },
  ),
)
const values = Object.fromEntries(
  outputs.map((o) => [o.OutputKey, o.OutputValue]),
)
let mapKey = ''
if (values.MapKeyName) {
  mapKey = JSON.parse(
    execFileSync(
      'aws',
      [
        'location',
        'describe-key',
        '--key-name',
        values.MapKeyName,
        '--region',
        region,
        '--output',
        'json',
      ],
      { encoding: 'utf8' },
    ),
  ).Key
}
let existing = ''
try {
  existing = await readFile('.env.local', 'utf8')
} catch {}
const config = {
  VITE_MAP_API_KEY: mapKey,
  VITE_AWS_REGION: values.Region,
  VITE_COGNITO_CLIENT_ID: values.UserPoolClientId,
  VITE_STORAGE_API_URL: values.ApiUrl,
  VITE_PROCESSING_API_URL: values.ApiUrl,
  VITE_ENABLE_INSTAGRAM_PREVIEW: 'true',
}
const retained = existing
  .split('\n')
  .filter(
    (line) =>
      !Object.keys(config).some((key) => line.startsWith(key + '=')),
  )
await writeFile(
  '.env.local',
  retained.join('\n').trim() +
    '\n' +
    Object.entries(config)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n') +
    '\n',
)
console.log(
  'Updated ignored .env.local with public cloud identifiers. Restart Vite to apply.',
)
