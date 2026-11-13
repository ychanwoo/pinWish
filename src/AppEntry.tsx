const SharedItineraryPage = lazy(
  () => import('./components/journeys/SharedItineraryPage'),
)
import { lazy, Suspense, useSyncExternalStore } from 'react'
import { LoadingOverlay } from './components/shared/LoadingOverlay'
import App from './App'
const SharedCollectionPage = lazy(
  () => import('./components/collections/SharedCollectionPage'),
)
const subscribeLocation = (notify: () => void) => {
  window.addEventListener('hashchange', notify)
  return () => window.removeEventListener('hashchange', notify)
}
export default function AppEntry() {
  const hash = useSyncExternalStore(subscribeLocation, () => location.hash)
  if (hash.startsWith('#trip='))
    return (
      <Suspense fallback={<LoadingOverlay active />}>
        <SharedItineraryPage key={hash} token={hash.slice(6)} />
      </Suspense>
    )
  return hash.startsWith('#share=') ? (
    <Suspense fallback={<LoadingOverlay active />}>
      <SharedCollectionPage key={hash} token={hash.slice(7)} />
    </Suspense>
  ) : (
    <App />
  )
}
