import { useCallback, useRef, useState } from 'react'
import {
  initialPlaces,
  type Place,
  type View,
  type Category,
} from '../data/places'
interface WorkspaceNavigationOptions {
  places: Place[]
  initialView: View
  initialSelectedId: string | null
  cloudEnabled: boolean
  onNotice: (message: string) => void
  onOpenDetail: () => void
}
export function useWorkspaceNavigation({
  places,
  initialView,
  initialSelectedId,
  cloudEnabled,
  onNotice,
  onOpenDetail,
}: WorkspaceNavigationOptions) {
  const [view, setView] = useState<View>(initialView)
  const [selectedId, setSelectedId] = useState(
    initialSelectedId || initialPlaces[0].id,
  )
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<Category | 'All'>('All')
  const [onlyUnvisited, setOnlyUnvisited] = useState(false)
  const [collection, setCollection] = useState(
    cloudEnabled
      ? 'Saved places'
      : initialView === 'empty'
        ? 'Weekend ideas'
        : 'LA weekend',
  )
  const returnView = useRef<View>('list')
  const selected =
    places.find((p) => p.id === selectedId) ||
    initialPlaces.find((p) => p.id === selectedId) ||
    initialPlaces[0]
  const changeCollection = (name: string) => {
    setCollection(name)
    setCategory('All')
    setOnlyUnvisited(false)
    setSearch('')
    const first = places.find((p) =>
      !cloudEnabled && name === 'Coffee'
        ? p.category === 'Coffee'
        : !cloudEnabled && name === 'Galleries'
          ? p.category === 'Culture'
          : p.collection === name,
    )
    if (first) setSelectedId(first.id)
    setView('list')
  }
  const navigate = useCallback(
    (next: View) => {
      setView(next)
      onNotice('')
      window.scrollTo(0, 0)
    },
    [onNotice],
  )
  const openDetail = (place: Place) => {
    returnView.current = view === 'map' || view === 'saved' ? 'map' : 'list'
    setSelectedId(place.id)
    setCollection(place.collection)
    onOpenDetail()
    navigate('detail')
    setTimeout(() => document.getElementById('place-heading')?.focus(), 0)
  }
  return {
    view,
    setView,
    selectedId,
    setSelectedId,
    search,
    setSearch,
    category,
    setCategory,
    onlyUnvisited,
    setOnlyUnvisited,
    collection,
    setCollection,
    returnView,
    selected,
    changeCollection,
    navigate,
    openDetail,
  }
}
