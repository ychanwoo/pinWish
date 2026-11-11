import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { aws, configuration, stack, region } from './aws-util.mjs'
execFileSync('node', ['scripts/cloud/build-processing.mjs'], {
  stdio: 'inherit',
})
execFileSync('node', ['scripts/cloud/build-template.mjs'], { stdio: 'inherit' })
const { outputs, parameters } = configuration(),
  artifact = JSON.parse(
    await readFile('infra/generated/processing-artifact.json'),
  )
aws([
  's3api',
  'put-object',
  '--bucket',
  outputs.PhotoBucketName,
  '--key',
  artifact.key,
  '--body',
  'infra/generated/processing.zip',
])
const args = [
  'cloudformation',
  'deploy',
  '--template-file',
  'infra/generated/storage.json',
  '--s3-bucket',
  outputs.PhotoBucketName,
  '--s3-prefix',
  'deployments/templates',
  '--stack-name',
  stack,
  '--capabilities',
  'CAPABILITY_IAM',
  '--region',
  region,
  '--no-fail-on-empty-changeset',
  '--parameter-overrides',
  `ProcessingCodeKey=${artifact.key}`,
  'RuntimeEnabled=false',
]
if (process.env.PINWISH_HOSTING_APP)
  args.push(`HostingAppId=${process.env.PINWISH_HOSTING_APP}`)
if (process.env.PINWISH_ORIGIN) {
  const origin = process.env.PINWISH_ORIGIN
  args.push(
    `AllowedOrigins=${[...new Set([...parameters.AllowedOrigins.split(','), origin])].join(',')}`,
    `MapReferers=${[...new Set([...parameters.MapReferers.split(','), origin + '/*'])].join(',')}`,
  )
}
execFileSync('aws', args, { stdio: 'inherit' })
for (let attempt = 0; attempt < 4; attempt++) {
  try {
    execFileSync('node', ['scripts/cloud/runtime.mjs', 'off'], {
      stdio: 'inherit',
    })
    break
  } catch (error) {
    if (attempt === 3) throw error
    await new Promise((resolve) => setTimeout(resolve, 8000))
  }
}
console.log(
  'Backend deployed with runtime disabled. Open a bounded test window before testing.',
)
