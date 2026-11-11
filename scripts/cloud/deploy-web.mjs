import { execFileSync } from 'node:child_process'
import { writeFile, rm } from 'node:fs/promises'
import { aws, configuration, region } from './aws-util.mjs'
let app = aws(['amplify', 'list-apps']).apps.find(
  (x) => x.name === 'pinwish-web',
)
if (!app)
  app = aws([
    'amplify',
    'create-app',
    '--name',
    'pinwish-web',
    '--platform',
    'WEB',
    '--custom-rules',
    JSON.stringify([{ source: '/<*>', target: '/paused.html', status: '200' }]),
  ]).app
aws([
  'amplify',
  'update-app',
  '--app-id',
  app.appId,
  '--custom-headers',
  `customHeaders:
  - pattern: '**'
    headers:
      - key: X-Content-Type-Options
        value: nosniff
      - key: X-Frame-Options
        value: DENY
      - key: Referrer-Policy
        value: strict-origin-when-cross-origin
      - key: Cache-Control
        value: no-cache
`,
])
const branch = 'demo'
if (
  !aws(['amplify', 'list-branches', '--app-id', app.appId]).branches.some(
    (x) => x.branchName === branch,
  )
)
  aws([
    'amplify',
    'create-branch',
    '--app-id',
    app.appId,
    '--branch-name',
    branch,
    '--no-enable-auto-build',
  ])
const origin = `https://${branch}.${app.defaultDomain}`
await writeFile(
  'infra/generated/hosting.json',
  JSON.stringify({ appId: app.appId, branch, origin }),
)
const { outputs } = configuration()
const map = aws(['location', 'describe-key', '--key-name', outputs.MapKeyName])
execFileSync('npm', ['run', 'build'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_AWS_REGION: region,
    VITE_COGNITO_CLIENT_ID: outputs.UserPoolClientId,
    VITE_STORAGE_API_URL: outputs.ApiUrl,
    VITE_PROCESSING_API_URL: outputs.ApiUrl,
    VITE_ENABLE_INSTAGRAM_PREVIEW: 'true',
    VITE_MAP_API_KEY: map.Key,
  },
})
await rm('infra/generated/web.zip', { force: true })
execFileSync('zip', ['-q', '-r', '../infra/generated/web.zip', '.'], {
  cwd: 'dist',
})
const deployment = aws([
  'amplify',
  'create-deployment',
  '--app-id',
  app.appId,
  '--branch-name',
  branch,
])
const { readFile } = await import('node:fs/promises')
const uploaded = await fetch(deployment.zipUploadUrl, {
  method: 'PUT',
  body: await readFile('infra/generated/web.zip'),
  headers: { 'Content-Type': 'application/zip' },
})
if (!uploaded.ok) throw Error('Amplify artifact upload failed')
aws([
  'amplify',
  'start-deployment',
  '--app-id',
  app.appId,
  '--branch-name',
  branch,
  '--job-id',
  deployment.jobId,
])
console.log(
  JSON.stringify({ appId: app.appId, origin, jobId: deployment.jobId }),
)

for (let attempt = 0; attempt < 90; attempt++) {
  const job = aws([
    'amplify',
    'get-job',
    '--app-id',
    app.appId,
    '--branch-name',
    branch,
    '--job-id',
    deployment.jobId,
  ]).job.summary
  if (job.status === 'SUCCEED') {
    console.log('Web deployment verified.')
    break
  }
  if (['FAILED', 'CANCELLED'].includes(job.status))
    throw Error('Amplify deployment ' + job.status)
  if (attempt === 89)
    throw Error('Deployment is still pending; inspect Amplify before retrying.')
  await new Promise((resolve) => setTimeout(resolve, 5000))
}
