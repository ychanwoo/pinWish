import SharedItineraryPage from './components/SharedItineraryPage'
import { useSyncExternalStore } from 'react'
import App from './App'
import SharedCollectionPage from './components/SharedCollectionPage'
const subscribeLocation = (notify: () => void) => {
  window.addEventListener('hashchange', notify)
  return () => window.removeEventListener('hashchange', notify)
}
export default function AppEntry() {
  const hash = useSyncExternalStore(subscribeLocation, () => location.hash)
  if(hash.startsWith('#trip=')) return <SharedItineraryPage key={hash} token={hash.slice(6)} />
  return hash.startsWith('#share=') ? (
    <SharedCollectionPage key={hash} token={hash.slice(7)} />
  ) : (
    <App />
  )
}
