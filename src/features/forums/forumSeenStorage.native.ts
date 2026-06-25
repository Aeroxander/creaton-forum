// native storage backend for forum seen-tracking (react-native-mmkv)

import { MMKV } from 'react-native-mmkv'

const FORUM_SEEN_KEY = 'creaton:forum:seen-boards:v1'
const FORUM_SEEN_TOPIC_KEY = 'creaton:forum:seen-topics:v1'
const FORUM_SEEN_EVENT = 'creaton:forum-seen-updated'

const mmkv = new MMKV({ id: 'forum-seen-storage' })

// MMKV has no event emitter we can rely on cross-instance, so we use a
// simple listener set. Components subscribe through subscribeSeen().
const listeners = new Set<() => void>()

export { FORUM_SEEN_KEY, FORUM_SEEN_TOPIC_KEY, FORUM_SEEN_EVENT }

export function storageKey(baseKey: string, viewerDid?: string) {
  return viewerDid ? `${baseKey}:${viewerDid}` : baseKey
}

export function readMap(baseKey: string, viewerDid?: string): Record<string, number> {
  const seen: Record<string, number> = {}
  try {
    const raw = mmkv.getString(storageKey(baseKey, viewerDid))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return seen
    for (const [uri, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value)) seen[uri] = value
    }
  } catch {
    // ignore
  }
  return seen
}

export function writeMap(
  baseKey: string,
  viewerDid: string | undefined,
  map: Record<string, number>,
) {
  mmkv.set(storageKey(baseKey, viewerDid), JSON.stringify(map))
  for (const listener of listeners) listener()
}

export function subscribeSeen(onStoreChange: () => void) {
  listeners.add(onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
  }
}
