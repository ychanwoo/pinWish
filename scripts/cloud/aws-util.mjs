import { execFileSync } from 'node:child_process'
export const region = process.env.AWS_REGION ?? 'us-east-1'
export const stack = process.env.PINWISH_STACK ?? 'pinwish-storage-dev'
export function aws(args) {
  try {
    const out = execFileSync(
      'aws',
      [...args, '--region', region, '--output', 'json'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
    return out.trim() ? JSON.parse(out) : {}
  } catch (e) {
    throw Error(
      `AWS ${args[0]} ${args[1]} failed: ${e.stderr?.toString().slice(0, 350) ?? 'request failed'}`,
    )
  }
}
export function configuration() {
  const data = aws(['cloudformation', 'describe-stacks', '--stack-name', stack])
    .Stacks[0]
  return {
    outputs: Object.fromEntries(
      data.Outputs.map((x) => [x.OutputKey, x.OutputValue]),
    ),
    parameters: Object.fromEntries(
      data.Parameters.map((x) => [x.ParameterKey, x.ParameterValue]),
    ),
  }
}
