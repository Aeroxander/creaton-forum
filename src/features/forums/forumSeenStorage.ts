// web storage backend for forum seen-tracking

const FORUM_SEEN_KEY = 'creaton:forum:seen-boards:v1'
const FORUM_SEEN_TOPIC_KEY = 'creaton:forum:seen-topics:v1'
const FORUM_SEEN_EVENT = 'creaton:forum-seen-updated'

export { FORUM_SEEN_KEY, FORUM_SEEN_TOPIC_KEY, FORUM_SEEN_EVENT }

export function storageKey(baseKey: string, viewerDid?: string) {
  return viewerDid ? `${baseKey}:${viewerDid}` : baseKey
}

export function readMap(baseKey: string, viewerDid?: string): Record<string, number> {
  if (typeof localStorage === 'undefined') return {}

  try {
    const raw = localStorage.getItem(storageKey(baseKey, viewerDid))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}

    const seen: Record<string, number> = {}
    for (const [uri, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value)) seen[uri] = value
    }
    return seen
  } catch {
    return {}
  }
}

export function writeMap(
  baseKey: string,
  viewerDid: string | undefined,
  map: Record<string, number>,
) {
  localStorage.setItem(storageKey(baseKey, viewerDid), JSON.stringify(map))
  window.dispatchEvent(new Event(FORUM_SEEN_EVENT))
}

export function subscribeSeen(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => {}

  const handleStorage = (event: StorageEvent) => {
    if (event.key?.startsWith(FORUM_SEEN_KEY) || event.key?.startsWith(FORUM_SEEN_TOPIC_KEY)) {
      onStoreChange()
    }
  }
  window.addEventListener('storage', handleStorage)
  window.addEventListener(FORUM_SEEN_EVENT, onStoreChange)
  return () => {
    window.removeEventListener('storage', handleStorage)
    window.removeEventListener(FORUM_SEEN_EVENT, onStoreChange)
  }
}
