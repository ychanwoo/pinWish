import { useState } from 'react'
import { useModalFocus } from '../hooks/useModalFocus'
import {
  authError,
  confirmEmail,
  emailError,
  forgotPassword,
  passwordError,
  passwordRequirements,
  resendCode,
  resetPassword,
  signIn,
  signUp,
} from '../lib/cloud-auth'
type Mode = 'login' | 'signup' | 'verify' | 'forgot' | 'reset'
export function AuthModal({
  onClose,
  onSuccess,
  reason = '',
}: {
  onClose: () => void
  onSuccess: () => void
  reason?: string
}) {
  const [mode, setMode] = useState<Mode>('login'),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [code, setCode] = useState('')
  const [remember, setRemember] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false),
    [submitted, setSubmitted] = useState(false),
    [touched, setTouched] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('')
  const close = () => {
    if (!busy) onClose()
  }
  const modal = useModalFocus(true, close)
  const emailIssue = touched || submitted ? emailError(email) : ''
  const passwordIssue =
    submitted && ['signup', 'reset'].includes(mode)
      ? passwordError(password)
      : ''
  const change = (next: Mode) => {
    setMode(next)
    setError('')
    setMessage('')
    setSubmitted(false)
    setPassword('')
    setShowPassword(false)
    setCode('')
  }
  const titles = {
    login: 'Welcome back',
    signup: 'Create your account',
    verify: 'Check your email',
    forgot: 'Reset your password',
    reset: 'Choose a new password',
  }
  return (
    <div className="auth-overlay" ref={modal}>
      <section
        className="auth-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
      >
        <button
          type="button"
          className="auth-close"
          onClick={close}
          disabled={busy}
        >
          Close
        </button>
        <p className="auth-brand">pinWish</p>
        <h2 id="auth-title">{titles[mode]}</h2>
        {['login', 'signup'].includes(mode) && (
          <div className="auth-tabs">
            <button
              type="button"
              aria-pressed={mode === 'login'}
              disabled={busy}
              onClick={() => change('login')}
            >
              Sign in
            </button>
            <button
              type="button"
              aria-pressed={mode === 'signup'}
              disabled={busy}
              onClick={() => change('signup')}
            >
              Create account
            </button>
          </div>
        )}
        <p className="auth-caption">
          {reason || 'Keep the places you want to visit, all in one place.'}
        </p>
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault()
            if (busy) return
            setSubmitted(true)
            setError('')
            setMessage('')
            if (
              emailError(email) ||
              (['signup', 'reset'].includes(mode) && passwordError(password))
            )
              return
            if (['login', 'signup', 'reset'].includes(mode) && !password) {
              setError('Enter your password.')
              return
            }
            if (
              ['verify', 'reset'].includes(mode) &&
              !/^\d{6}$/.test(code.trim())
            ) {
              setError('Enter the six-digit code from your email.')
              return
            }
            setBusy(true)
            try {
              if (mode === 'login') {
                await signIn(email, password, remember)
                onSuccess()
              } else if (mode === 'signup') {
                await signUp(email, password)
                change('verify')
                setMessage(
                  'Account created. Enter the verification code sent to your email.',
                )
              } else if (mode === 'verify') {
                await confirmEmail(email, code)
                change('login')
                setMessage('Email verified. You can now sign in.')
              } else if (mode === 'forgot') {
                await forgotPassword(email)
                change('reset')
                setMessage(
                  'If the account is eligible, a reset code has been sent.',
                )
              } else {
                await resetPassword(email, code, password)
                change('login')
                setMessage('Password updated. Sign in with your new password.')
              }
            } catch (failure) {
              if (mode === 'login' && failure instanceof Error && failure.name === 'UserNotConfirmedException') {
                change('verify')
                setMessage('Verify your email to finish setting up your account. Enter your code, or request a new one below.')
              } else {
                setError(authError(failure))
              }
            } finally {
              setBusy(false)
            }
          }}
        >
          <label htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            value={email}
            maxLength={254}
            onBlur={() => setTouched(true)}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!emailIssue}
            aria-describedby={emailIssue ? 'auth-email-error' : undefined}
            disabled={busy}
          />
          {emailIssue && (
            <p className="field-error" id="auth-email-error" role="alert">
              {emailIssue}
            </p>
          )}
          {['login', 'signup', 'reset'].includes(mode) && (
            <>
              <label htmlFor="auth-password">Password</label>
              <div className="auth-password-field">
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={
                  mode === 'login' ? 'current-password' : 'new-password'
                }
                value={password}
                maxLength={256}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                aria-invalid={!!passwordIssue}
                aria-describedby={
                  mode !== 'login' ? 'password-help' : undefined
                }
              />
              <button
                type="button"
                className="password-visibility-toggle"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-controls="auth-password"
                disabled={busy}
                onClick={() => setShowPassword(visible => !visible)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                  <circle cx="12" cy="12" r="3" />
                  {showPassword && <path d="m3 3 18 18" />}
                </svg>
              </button>
              </div>
              {mode !== 'login' && (
                <ul id="password-help" className="password-requirements" aria-label="Password requirements">
                  {passwordRequirements(password).map(requirement => (
                    <li key={requirement.id} className={requirement.met ? 'is-met' : passwordIssue ? 'is-unmet' : ''}>
                      <span className="password-requirement-mark" aria-hidden="true">{requirement.met ? '✓' : '–'}</span>
                      <span>{requirement.label}<span className="password-requirement-state">{requirement.met ? ': met' : ': not met'}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {mode === 'login' && (
            <label className="remember-choice">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                disabled={busy}
              />
              Keep me signed in for 7 days
            </label>
          )}
          {['verify', 'reset'].includes(mode) && (
            <>
              <label htmlFor="auth-code">Verification code</label>
              <input
                id="auth-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                maxLength={6}
                onChange={(e) => setCode(e.target.value)}
                disabled={busy}
              />
            </>
          )}
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          {message && <p role="status">{message}</p>}
          <button className="primary auth-submit" disabled={busy}>
            {busy
              ? 'Please wait…'
              : {
                  login: 'Sign in',
                  signup: 'Create account',
                  verify: 'Verify email',
                  forgot: 'Send reset code',
                  reset: 'Update password',
                }[mode]}
          </button>
        </form>
        <div className="auth-links">
          {mode === 'login' ? (
            <>
              <button disabled={busy} onClick={() => change('signup')}>
                Create an account
              </button>
              <button disabled={busy} onClick={() => change('forgot')}>
                Forgot password?
              </button>
            </>
          ) : (
            <button disabled={busy} onClick={() => change('login')}>
              Back to sign in
            </button>
          )}
          {mode === 'verify' && (
            <button
              disabled={busy}
              onClick={async () => {
                setTouched(true)
                if (emailError(email)) return
                setBusy(true)
                setError('')
                try {
                  await resendCode(email)
                  setMessage('A new verification code has been sent.')
                } catch (e) {
                  setError(authError(e))
                } finally {
                  setBusy(false)
                }
              }}
            >
              Resend code
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
