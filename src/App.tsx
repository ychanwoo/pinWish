function App() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-page px-6 py-12 text-ink">
      <section className="w-full max-w-lg rounded-xl border border-brand/15 bg-white p-8 sm:p-10">
        <p className="text-xl font-semibold tracking-tight text-brand">pinWish</p>
        <h1 className="mt-8 text-3xl font-semibold tracking-tight sm:text-4xl">
          Save places.<br />Come back to them.
        </h1>
        <p className="mt-4 text-sm leading-6 text-muted">
          Your places, notes, and collections — together on one map.
        </p>
        <a
          className="mt-8 inline-flex min-h-12 items-center justify-center rounded-md bg-brand px-5 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
          href="https://www.figma.com/design/cwIWojuveOSNxGeK3nlDUZ/pinWish"
          target="_blank"
          rel="noreferrer"
        >
          View PinWish design
        </a>
      </section>
    </main>
  )
}

export default App
