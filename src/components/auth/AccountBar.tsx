interface AccountBarProps {
  session: { email: string } | null
  inert: boolean
  onSignIn: () => void
  onSignOut: () => void
}
export function AccountBar({
  session,
  inert,
  onSignIn,
  onSignOut,
}: AccountBarProps) {
  return (
    <header className="account-bar" inert={inert}>
      <span>pinWish</span>
      <div>
        {session ? (
          <>
            <span className="account-email">{session.email}</span>
            <button onClick={onSignOut}>Sign out</button>
          </>
        ) : (
          <button className="primary small" onClick={onSignIn}>
            Sign in
          </button>
        )}
      </div>
    </header>
  )
}
