const {
  LambdaClient,
  PutFunctionConcurrencyCommand,
} = require('@aws-sdk/client-lambda')
const {
  ApiGatewayV2Client,
  UpdateApiCommand,
} = require('@aws-sdk/client-apigatewayv2')
const {
  EventBridgeClient,
  DisableRuleCommand,
} = require('@aws-sdk/client-eventbridge')
const {
  LocationClient,
  DescribeKeyCommand,
  UpdateKeyCommand,
} = require('@aws-sdk/client-location')
const { AmplifyClient, UpdateAppCommand } = require('@aws-sdk/client-amplify')
exports.handler = async () => {
  const failures = []
  async function attempt(name, fn) {
    try {
      await fn()
    } catch (error) {
      console.error(name, error.name, error.message)
      failures.push(name)
    }
  }
  const lambda = new LambdaClient({})
  await attempt('api', () =>
    new ApiGatewayV2Client({}).send(
      new UpdateApiCommand({
        ApiId: process.env.API_ID,
        DisableExecuteApiEndpoint: true,
      }),
    ),
  )
  for (const name of [
    process.env.STORAGE_FUNCTION,
    process.env.PROCESSING_FUNCTION,
    process.env.WORKER_FUNCTION,
  ])
    await attempt(name, () =>
      lambda.send(
        new PutFunctionConcurrencyCommand({
          FunctionName: name,
          ReservedConcurrentExecutions: 0,
        }),
      ),
    )
  await attempt('cleanup', () =>
    new EventBridgeClient({}).send(
      new DisableRuleCommand({ Name: process.env.CLEANUP_RULE }),
    ),
  )
  await attempt('map', async () => {
    const client = new LocationClient({})
    const key = await client.send(
      new DescribeKeyCommand({ KeyName: process.env.MAP_KEY }),
    )
    await client.send(
      new UpdateKeyCommand({
        KeyName: process.env.MAP_KEY,
        Restrictions: {
          ...key.Restrictions,
          AllowReferers: ['https://paused.invalid/*'],
        },
        ForceUpdate: true,
      }),
    )
  })
  if (process.env.HOSTING_APP !== 'none')
    await attempt('hosting', () =>
      new AmplifyClient({}).send(
        new UpdateAppCommand({
          appId: process.env.HOSTING_APP,
          customRules: [
            { source: '/<*>', target: '/paused.html', status: '200' },
          ],
        }),
      ),
    )
  if (failures.length) throw Error('Pause failed: ' + failures.join(','))
  return { paused: true }
}
