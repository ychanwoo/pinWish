import { writeFile } from 'node:fs/promises'
import { aws, configuration, stack } from './aws-util.mjs'
const mode = process.argv[2] ?? 'status'
const { outputs, parameters } = configuration()
const apiId = new URL(outputs.ApiUrl).hostname.split('.')[0]
if (mode === 'off') {
  const result = aws([
    'lambda',
    'invoke',
    '--function-name',
    stack + '-pause',
    'infra/generated/pause-result.json',
  ])
  if (result.FunctionError)
    throw Error('Automatic pause failed. Inspect the pause function logs.')
  const timer = aws([
    'scheduler',
    'get-schedule',
    '--name',
    outputs.AutoPauseName,
  ])
  aws([
    'scheduler',
    'update-schedule',
    '--name',
    outputs.AutoPauseName,
    '--schedule-expression',
    timer.ScheduleExpression,
    '--state',
    'DISABLED',
    '--flexible-time-window',
    '{"Mode":"OFF"}',
    '--target',
    JSON.stringify(timer.Target),
  ])
  await writeFile('.aws-runtime.local', JSON.stringify({ enabled: false }))
  console.log(
    'Runtime paused: API, workers, scheduled cleanup, map key and hosted app.',
  )
} else if (mode === 'on') {
  const minutes = Number(process.argv[3] ?? 60)
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 120)
    throw Error('Choose a test window between 5 and 120 minutes.')
  const end = new Date(Date.now() + minutes * 60000)
  // Arm automatic shutoff before opening any service.
  const schedule = aws([
    'scheduler',
    'get-schedule',
    '--name',
    outputs.AutoPauseName,
  ])
  aws([
    'scheduler',
    'update-schedule',
    '--name',
    outputs.AutoPauseName,
    '--schedule-expression',
    `at(${end.toISOString().slice(0, 19)})`,
    '--schedule-expression-timezone',
    'UTC',
    '--state',
    'ENABLED',
    '--flexible-time-window',
    '{"Mode":"OFF"}',
    '--target',
    JSON.stringify(schedule.Target),
  ])
  try {
    for (const name of ['storage', 'processing', 'worker'])
      aws([
        'lambda',
        'delete-function-concurrency',
        '--function-name',
        stack + '-' + name,
      ])
    const resources = aws([
      'cloudformation',
      'list-stack-resources',
      '--stack-name',
      stack,
    ]).StackResourceSummaries
    const cleanup = resources.find(
      (x) => x.LogicalResourceId === 'PhotoCleanup',
    ).PhysicalResourceId
    aws(['events', 'enable-rule', '--name', cleanup])
    const map = aws([
      'location',
      'describe-key',
      '--key-name',
      outputs.MapKeyName,
    ])
    aws([
      'location',
      'update-key',
      '--key-name',
      outputs.MapKeyName,
      '--restrictions',
      JSON.stringify({
        ...map.Restrictions,
        AllowReferers: parameters.MapReferers.split(','),
      }),
      '--force-update',
    ])
    aws([
      'apigatewayv2',
      'update-api',
      '--api-id',
      apiId,
      '--no-disable-execute-api-endpoint',
    ])
    if (parameters.HostingAppId !== 'none')
      aws([
        'amplify',
        'update-app',
        '--app-id',
        parameters.HostingAppId,
        '--custom-rules',
        JSON.stringify([
          { source: '/<*>', target: '/index.html', status: '404-200' },
        ]),
      ])
    await writeFile(
      '.aws-runtime.local',
      JSON.stringify({ enabled: true, until: end.toISOString() }),
    )
    console.log(
      `Test window opened for ${minutes} minutes. Automatic pause scheduled for ${end.toISOString()}.`,
    )
  } catch (e) {
    try {
      aws([
        'lambda',
        'invoke',
        '--function-name',
        stack + '-pause',
        'infra/generated/pause-result.json',
      ])
    } catch {}
    throw e
  }
} else if (mode === 'status') {
  const api = aws(['apigatewayv2', 'get-api', '--api-id', apiId])
  const workers = {}
  for (const name of ['storage', 'processing', 'worker'])
    workers[name] =
      aws([
        'lambda',
        'get-function-concurrency',
        '--function-name',
        stack + '-' + name,
      ]).ReservedConcurrentExecutions ?? 'unreserved'
  const timer = aws([
    'scheduler',
    'get-schedule',
    '--name',
    outputs.AutoPauseName,
  ])
  const map = aws([
    'location',
    'describe-key',
    '--key-name',
    outputs.MapKeyName,
  ])
  const resources = aws([
    'cloudformation',
    'list-stack-resources',
    '--stack-name',
    stack,
  ]).StackResourceSummaries
  const cleanup = aws([
    'events',
    'describe-rule',
    '--name',
    resources.find((r) => r.LogicalResourceId === 'PhotoCleanup')
      .PhysicalResourceId,
  ])
  const hosting =
    parameters.HostingAppId === 'none'
      ? null
      : aws(['amplify', 'get-app', '--app-id', parameters.HostingAppId]).app
  console.log(
    JSON.stringify(
      {
        mapPaused:
          map.Restrictions.AllowReferers.length === 1 &&
          map.Restrictions.AllowReferers[0] === 'https://paused.invalid/*',
        cleanupState: cleanup.State,
        hostingPaused:
          hosting?.customRules?.some(
            (rule) => rule.target === '/paused.html',
          ) ?? null,
        apiDisabled: api.DisableExecuteApiEndpoint,
        workers,
        autoPause: { state: timer.State, expression: timer.ScheduleExpression },
      },
      null,
      2,
    ),
  )
} else throw Error('Use on [minutes], off, or status')
