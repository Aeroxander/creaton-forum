import type { ForumTopicMetadata } from '@creaton/forum-core'

export function timestampFor(iso?: string) {
  if (!iso) return 0
  const timestamp = Date.parse(iso)
  return Number.isFinite(timestamp) ? timestamp : 0
}

export function isForumTopicUnread(
  topicUri: string,
  createdAt: string,
  metadata: ForumTopicMetadata | undefined,
  seenTopics: Record<string, number>,
) {
  const latest = timestampFor(metadata?.latestActivityAt ?? createdAt)
  const seenAt = seenTopics[topicUri] ?? 0
  return seenAt < latest
}

export function isForumBoardUnseen(
  boardUri: string,
  latestActivity: Map<string, number>,
  seenBoards: Record<string, number>,
  unreadBoardTopics: Set<string>,
) {
  if (unreadBoardTopics.has(boardUri)) return true

  const latest = latestActivity.get(boardUri) ?? 0
  const seenAt = seenBoards[boardUri] ?? 0
  return seenAt < latest
}

type BoardRecord = {
  uri: string
  value: { updatedAt?: string; createdAt: string }
}

type TopicRecord = {
  uri: string
  value: {
    createdAt: string
    updatedAt?: string
    board?: { uri?: string }
  }
}

export function buildBoardLatestActivity(
  subscribedBoards: BoardRecord[],
  homeTopics: TopicRecord[],
  activityMetadata: Map<string, ForumTopicMetadata> | undefined,
) {
  const latest = new Map<string, number>()

  for (const board of subscribedBoards) {
    latest.set(board.uri, timestampFor(board.value.updatedAt ?? board.value.createdAt))
  }

  for (const topic of homeTopics) {
    const boardUri = topic.value.board?.uri
    if (!boardUri) continue

    const metadata = activityMetadata?.get(topic.uri)
    const activityAt =
      metadata?.latestActivityAt ?? topic.value.updatedAt ?? topic.value.createdAt
    latest.set(boardUri, Math.max(latest.get(boardUri) ?? 0, timestampFor(activityAt)))
  }

  return latest
}

export function buildUnreadBoardTopics(
  homeTopics: TopicRecord[],
  activityMetadata: Map<string, ForumTopicMetadata> | undefined,
  seenTopics: Record<string, number>,
) {
  const unread = new Set<string>()
  for (const topic of homeTopics) {
    const boardUri = topic.value.board?.uri
    if (!boardUri) continue

    const metadata = activityMetadata?.get(topic.uri)
    if (isForumTopicUnread(topic.uri, topic.value.createdAt, metadata, seenTopics)) {
      unread.add(boardUri)
    }
  }
  return unread
}
