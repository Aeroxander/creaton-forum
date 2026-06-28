import { Link, type Href } from 'one'
import { SizableText, YStack } from 'tamagui'
import {
  CREATON_FORUM_BOARD_COLLECTION,
  CREATON_FORUM_COMMENT_COLLECTION,
  CREATON_FORUM_TOPIC_COLLECTION,
  parseAtUri,
  type StrongRef,
} from '@creaton/forum-core'

import { useQueryArbitrary, useQueryIdentity } from '~/features/profile/profileQueries'
import { useAuth } from '~/providers/UnifiedAuthProvider'

export function ForumSubjectPreview({
  board,
  subject,
}: {
  board?: StrongRef
  subject: StrongRef
}) {
  const { agent } = useAuth()
  const subjectParsed = parseAtUri(subject.uri)
  const subjectRecord = useQueryArbitrary(subject.uri)
  const topicRef = subjectRecord.data?.value?.topic as StrongRef | undefined
  const topicRecord = useQueryArbitrary(topicRef?.uri)
  const topicBoardRef = topicRecord.data?.value?.board as StrongRef | undefined
  const boardRecord = useQueryArbitrary(board?.uri ?? topicBoardRef?.uri)
  const authorDid = subjectParsed?.did
  const authorIdentity = useQueryIdentity(authorDid, agent)

  const href = buildForumSubjectHref({
    board: board ?? topicBoardRef,
    subject,
    topic: topicRef,
  })
  const preview = buildSubjectPreviewText({
    authorLabel: authorIdentity.data?.handle,
    boardTitle: stringValue(boardRecord.data?.value?.title),
    record: subjectRecord.data,
    subjectCollection: subjectParsed?.collection,
    topicTitle: stringValue(topicRecord.data?.value?.title),
  })

  const body = (
    <YStack gap="$1" minW={0}>
      <SizableText size="$4" fontWeight="600">
        {preview.title}
      </SizableText>
      <SizableText size="$3" opacity={0.7}>
        {preview.meta}
      </SizableText>
      {preview.snippet ? (
        <SizableText size="$3" opacity={0.7} numberOfLines={2}>
          {preview.snippet}
        </SizableText>
      ) : null}
    </YStack>
  )

  if (!href) return body

  return (
    <Link href={href}>
      <YStack gap="$1" minW={0} cursor="pointer" hoverStyle={{ opacity: 0.85 }}>
        {body}
      </YStack>
    </Link>
  )
}

export function ForumActorLabel({
  did,
  fallback = 'Forum member',
}: {
  did?: string | null
  fallback?: string
}) {
  const { agent } = useAuth()
  const identity = useQueryIdentity(did ?? undefined, agent)
  return <>{identity.data?.handle ? `@${identity.data.handle}` : fallback}</>
}

function forumSubjectFallbackLabel(collection?: string) {
  if (collection === CREATON_FORUM_BOARD_COLLECTION) return 'Unavailable board'
  if (collection === CREATON_FORUM_TOPIC_COLLECTION) return 'Unavailable topic'
  if (collection === CREATON_FORUM_COMMENT_COLLECTION) return 'Unavailable reply'
  return 'Unavailable forum item'
}

function buildSubjectPreviewText({
  authorLabel,
  boardTitle,
  record,
  subjectCollection,
  topicTitle,
}: {
  authorLabel?: string
  boardTitle?: string
  record?: { uri: string; value: Record<string, unknown> }
  subjectCollection?: string
  topicTitle?: string
}) {
  const value = record?.value
  const collection = parseAtUri(record?.uri ?? '')?.collection ?? subjectCollection
  const authorDid = parseAtUri(record?.uri ?? '')?.did
  const byline = authorLabel ? `@${authorLabel}` : authorDid ? 'Forum member' : undefined

  if (collection === CREATON_FORUM_BOARD_COLLECTION) {
    return {
      meta: 'Board',
      title: stringValue(value?.title) ?? forumSubjectFallbackLabel(collection),
    }
  }

  if (collection === CREATON_FORUM_TOPIC_COLLECTION) {
    return {
      meta: [boardTitle, byline].filter(Boolean).join(' · ') || 'Topic',
      title: stringValue(value?.title) ?? forumSubjectFallbackLabel(collection),
    }
  }

  if (collection === CREATON_FORUM_COMMENT_COLLECTION) {
    return {
      meta: [topicTitle, byline].filter(Boolean).join(' · ') || 'Reply',
      snippet: excerpt(stringValue(value?.body)),
      title: 'Reply',
    }
  }

  return {
    meta: 'Forum item',
    title: forumSubjectFallbackLabel(collection),
  }
}

function buildForumSubjectHref({
  board,
  subject,
  topic,
}: {
  board?: StrongRef
  subject: StrongRef
  topic?: StrongRef
}): Href | null {
  const subjectParsed = parseAtUri(subject.uri)
  if (!subjectParsed) return null

  if (subjectParsed.collection === CREATON_FORUM_BOARD_COLLECTION) {
    return `/home/forums/${subjectParsed.did}/${subjectParsed.rkey}` as Href
  }

  const boardParsed = parseAtUri(board?.uri ?? '')
  if (!boardParsed) return null

  if (subjectParsed.collection === CREATON_FORUM_TOPIC_COLLECTION) {
    return `/home/forums/${boardParsed.did}/${boardParsed.rkey}/topic/${subjectParsed.did}/${subjectParsed.rkey}` as Href
  }

  const topicParsed = parseAtUri(topic?.uri ?? '')
  if (subjectParsed.collection === CREATON_FORUM_COMMENT_COLLECTION && topicParsed) {
    return `/home/forums/${boardParsed.did}/${boardParsed.rkey}/topic/${topicParsed.did}/${topicParsed.rkey}` as Href
  }

  return null
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function excerpt(value?: string) {
  if (!value) return undefined
  const compact = value.replace(/\s+/g, ' ').trim()
  return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact
}
