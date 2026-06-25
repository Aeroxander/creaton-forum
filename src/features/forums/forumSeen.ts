import { useCallback, useMemo, useSyncExternalStore } from 'react'

import {
  FORUM_SEEN_KEY,
  FORUM_SEEN_TOPIC_KEY,
  readMap,
  subscribeSeen,
  storageKey,
  writeMap,
} from '~/features/forums/forumSeenStorage'

export function readForumSeenBoards(viewerDid?: string): Record<string, number> {
  return readMap(FORUM_SEEN_KEY, viewerDid)
}

export function readForumSeenTopics(viewerDid?: string): Record<string, number> {
  return readMap(FORUM_SEEN_TOPIC_KEY, viewerDid)
}

export function markForumBoardSeen(
  viewerDid: string | undefined,
  boardUri: string,
) {
  const seen = readForumSeenBoards(viewerDid)
  seen[boardUri] = Date.now()
  writeMap(FORUM_SEEN_KEY, viewerDid, seen)
}

export function markForumTopicSeen(
  viewerDid: string | undefined,
  topicUri: string,
) {
  const seen = readForumSeenTopics(viewerDid)
  seen[topicUri] = Date.now()
  writeMap(FORUM_SEEN_TOPIC_KEY, viewerDid, seen)
}

export function useForumSeenBoards(viewerDid?: string) {
  const getSnapshot = useCallback(
    () => JSON.stringify(readForumSeenBoards(viewerDid)),
    [viewerDid],
  )
  const serialized = useSyncExternalStore(subscribeSeen, getSnapshot, () => '{}')

  return useMemo(() => {
    try {
      return JSON.parse(serialized) as Record<string, number>
    } catch {
      return {}
    }
  }, [serialized])
}

export function useForumSeenTopics(viewerDid?: string) {
  const getSnapshot = useCallback(
    () => JSON.stringify(readForumSeenTopics(viewerDid)),
    [viewerDid],
  )
  const serialized = useSyncExternalStore(subscribeSeen, getSnapshot, () => '{}')

  return useMemo(() => {
    try {
      return JSON.parse(serialized) as Record<string, number>
    } catch {
      return {}
    }
  }, [serialized])
}

// re-export for components that need the raw key
export { storageKey }
