import { listCollections, listSaved } from './storage-api'

/** Read one consistent catalog and all its pages. Superseded reads never publish. */
export async function loadWorkspaceSnapshot(
  cursor: string | null,
  isCurrent: () => boolean,
) {
  const collectionResult = await listCollections()
  collectionResult.items.sort(
    (a, b) => Number(b.isDefault) - Number(a.isDefault),
  )
  const result = await listSaved(cursor)
  if (result.collectionVersion !== collectionResult.version)
    throw new Error(
      'Your collections changed while loading. Please refresh your places.',
    )
  const seen = new Set<string>()
  while (result.cursor) {
    if (!isCurrent()) return
    if (seen.has(result.cursor))
      throw new Error('Could not finish loading places. Please retry.')
    seen.add(result.cursor)
    const page = await listSaved(result.cursor)
    if (page.collectionVersion !== collectionResult.version)
      throw new Error(
        'Your collections changed while loading. Please refresh your places.',
      )
    result.items.push(...page.items)
    result.cursor = page.cursor
  }
  if (!isCurrent()) return
  return { collectionResult, result }
}
