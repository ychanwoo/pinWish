import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  SignUpCommand,
  ConfirmSignUpCommand,
  ResendConfirmationCodeCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  GlobalSignOutCommand,
} from '@aws-sdk/client-cognito-identity-provider'
export const cloudConfig = {
  region: import.meta.env.VITE_AWS_REGION ?? '',
  clientId: import.meta.env.VITE_COGNITO_CLIENT_ID ?? '',
  apiUrl: (import.meta.env.VITE_STORAGE_API_URL ?? '').replace(/\/$/, ''),
}
export const cloudEnabled = Boolean(
  cloudConfig.region && cloudConfig.clientId && cloudConfig.apiUrl,
)
const client = new CognitoIdentityProviderClient({
  region: cloudConfig.region || 'us-east-1',
  maxAttempts: 1,
})
interface Session {
  accessToken: string
  refreshToken: string
  expiresAt: number
  sub: string
  email: string
  rememberUntil?: number
}
const key = `pinwish:session:${cloudConfig.clientId}`
const listeners = new Set<() => void>()
let epoch = 0
function read(): Session | null {
  try {
    for (const storage of [sessionStorage, localStorage]) {
      const v = JSON.parse(storage.getItem(key) || 'null')
      if (v?.rememberUntil && v.rememberUntil <= Date.now()) {
        storage.removeItem(key)
        continue
      }
      if (
        v &&
        typeof v.accessToken === 'string' &&
        typeof v.refreshToken === 'string' &&
        typeof v.expiresAt === 'number' &&
        typeof v.sub === 'string' &&
        typeof v.email === 'string' &&
        (storage === sessionStorage || typeof v.rememberUntil === 'number')
      )
        return v
    }
    return null
  } catch {
    return null
  }
}
let session = read()
const publish = (value: Session | null) => {
  session = value
  try {
    sessionStorage.removeItem(key)
    localStorage.removeItem(key)
    if (value)
      (value.rememberUntil ? localStorage : sessionStorage).setItem(
        key,
        JSON.stringify(value),
      )
  } catch {
    /* Memory session still works when storage is unavailable. */
  }
  listeners.forEach((fn) => fn())
}
window.addEventListener('storage', (event) => {
  if (event.key === key) {
    epoch++
    sessionStorage.removeItem(key)
    session = read()
    listeners.forEach((fn) => fn())
  }
})
export const subscribeSession = (fn: () => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
export const getSession = () => session
export function emailError(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ? ''
    : 'Enter a valid email address, such as name@example.com.'
}
export function passwordRequirements(password: string) {
  return [
    { id: 'length', label: 'At least 12 characters', met: password.length >= 12 },
    { id: 'uppercase', label: 'An uppercase letter', met: /[A-Z]/.test(password) },
    { id: 'lowercase', label: 'A lowercase letter', met: /[a-z]/.test(password) },
    { id: 'number', label: 'A number', met: /\d/.test(password) },
    { id: 'symbol', label: 'A symbol', met: /[^\w\s]/.test(password) },
  ]
}
export function passwordError(password: string) {
  return passwordRequirements(password).every(requirement => requirement.met)
    ? ''
    : 'Use at least 12 characters with uppercase, lowercase, a number, and a symbol.'
}
export function authError(error: unknown) {
  const name = error instanceof Error ? error.name : ''
  return (
    (
      {
        InvalidParameterException:
          'Check your email, verification code, and password format.',
        NotAuthorizedException:
          'The email or password is incorrect, or your session has expired.',
        UserNotConfirmedException:
          'Verify your email before signing in.',
        UsernameExistsException:
          'An account with this email already exists. Try signing in.',
        CodeMismatchException:
          'That code is incorrect. Check the email and try again.',
        ExpiredCodeException: 'That code has expired. Request a new one.',
        LimitExceededException:
          'Too many attempts. Please wait before trying again.',
        TooManyRequestsException:
          'Too many attempts. Please wait before trying again.',
        InvalidPasswordException: passwordError(''),
        UserNotFoundException: 'Check your details and try again.',
      } as Record<string, string>
    )[name] ?? 'Unable to contact the account service. Please try again.'
  )
}
function decode(token: string) {
  return JSON.parse(
    atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
  )
}
function accept(
  result: {
    AccessToken?: string
    RefreshToken?: string
    ExpiresIn?: number
    IdToken?: string
  },
  email: string,
  refresh?: string,
  rememberUntil?: number,
) {
  if (!result.AccessToken || !(result.RefreshToken || refresh))
    throw Error('Missing tokens')
  const claims = decode(result.AccessToken)
  if (typeof claims.sub !== 'string') throw Error('Missing user')
  publish({
    accessToken: result.AccessToken,
    refreshToken: result.RefreshToken || refresh!,
    expiresAt: Date.now() + (result.ExpiresIn ?? 300) * 1000,
    sub: claims.sub,
    email,
    ...(rememberUntil ? { rememberUntil } : {}),
  })
}
export async function signIn(
  email: string,
  password: string,
  remember = false,
) {
  const version = ++epoch
  const r = await client.send(
    new InitiateAuthCommand({
      ClientId: cloudConfig.clientId,
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: { USERNAME: email.trim(), PASSWORD: password },
    }),
  )
  if (version !== epoch) return
  if (!r.AuthenticationResult) throw Error('Unsupported challenge')
  accept(
    r.AuthenticationResult,
    email.trim(),
    undefined,
    remember ? Date.now() + 7 * 24 * 60 * 60 * 1000 : undefined,
  )
}
export async function signUp(email: string, password: string) {
  await client.send(
    new SignUpCommand({
      ClientId: cloudConfig.clientId,
      Username: email.trim(),
      Password: password,
      UserAttributes: [{ Name: 'email', Value: email.trim() }],
    }),
  )
}
export async function confirmEmail(email: string, code: string) {
  await client.send(
    new ConfirmSignUpCommand({
      ClientId: cloudConfig.clientId,
      Username: email.trim(),
      ConfirmationCode: code.trim(),
    }),
  )
}
export async function resendCode(email: string) {
  await client.send(
    new ResendConfirmationCodeCommand({
      ClientId: cloudConfig.clientId,
      Username: email.trim(),
    }),
  )
}
export async function forgotPassword(email: string) {
  await client.send(
    new ForgotPasswordCommand({
      ClientId: cloudConfig.clientId,
      Username: email.trim(),
    }),
  )
}
export async function resetPassword(
  email: string,
  code: string,
  password: string,
) {
  await client.send(
    new ConfirmForgotPasswordCommand({
      ClientId: cloudConfig.clientId,
      Username: email.trim(),
      ConfirmationCode: code.trim(),
      Password: password,
    }),
  )
}
export function expireSession() {
  epoch++
  publish(null)
}
export async function signOut() {
  const old = session
  epoch++
  publish(null)
  if (old)
    await client
      .send(new GlobalSignOutCommand({ AccessToken: old.accessToken }))
      .catch(() => {})
}
let refreshing: Promise<string> | null = null
export async function accessToken(force = false): Promise<string> {
  if (session?.rememberUntil && session.rememberUntil <= Date.now()) {
    epoch++
    publish(null)
  }
  if (!session) throw new Error('Sign in to continue.')
  if (!force && session.expiresAt > Date.now() + 30000)
    return session.accessToken
  if (refreshing) return refreshing
  const current = session,
    version = epoch
  refreshing = (async () => {
    try {
      const r = await client.send(
        new InitiateAuthCommand({
          ClientId: cloudConfig.clientId,
          AuthFlow: 'REFRESH_TOKEN_AUTH',
          AuthParameters: { REFRESH_TOKEN: current.refreshToken },
        }),
      )
      if (version !== epoch || session?.sub !== current.sub)
        throw Error('Session changed')
      if (!r.AuthenticationResult) throw Error('Session expired')
      accept(
        r.AuthenticationResult,
        current.email,
        current.refreshToken,
        current.rememberUntil,
      )
      return session!.accessToken
    } catch (e) {
      if (
        version === epoch &&
        e instanceof Error &&
        e.name === 'NotAuthorizedException'
      )
        publish(null)
      throw e
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}
