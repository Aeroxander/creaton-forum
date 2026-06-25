import { useQuery } from '@tanstack/react-query'
import type { Href } from 'one'
import { useMemo, useState } from 'react'
import { Spinner, YStack } from 'tamagui'
import {
  discoverForumBoards,
  listRecentTopicsFromBoards,
  listYourForumBoards,
  listForumVotes,
  parseAtUri,
  buildForumTopicMetadata,
  sortForumTopics,
  type ForumTopicMetadata,
  type ForumTopicSort,
} from '@creaton/forum-core'

import { useForumSeenBoards, useForumSeenTopics } from '~/features/forums/forumSeen'
import {
  buildBoardLatestActivity,
  buildUnreadBoardTopics,
  isForumBoardUnseen,
  isForumTopicUnread,
} from '~/features/forums/forumUnread'
import { useForumConfig } from '~/features/forums/useForumQueries'
import { CreateBoardSheet } from '~/features/forums/ui/CreateBoardSheet'
import {
  ForumBoardRow,
  ForumBoardStoryRail,
  ForumEmpty,
  ForumPage,
  ForumPanel,
  ForumSectionHeader,
  ForumSortPicker,
  ForumTopicRow,
} from '~/features/forums/ui/ForumChrome'
import { formatForumDate } from '~/features/forums/ui/forumUtils'
import { toStringKeyMap } from '~/features/forums/forumMaps'
import { Button } from '~/interface/buttons/Button'
import { PageContainer } from '~/interface/layout/PageContainer'
import { useAuth } from '~/providers/UnifiedAuthProvider'

export function ForumsIndexPage() {
  const { agent, status } = useAuth()
  const { constellation, slingshoturl } = useForumConfig()
  const [sort, setSort] = useState<ForumTopicSort>('active')
  const [createOpen, setCreateOpen] = useState(false)

  const seenBoards = useForumSeenBoards(agent?.did)
  const seenTopics = useForumSeenTopics(agent?.did)

  const yourBoards = useQuery({
    queryKey: ['forum-your-boards', agent?.did, slingshoturl],
    queryFn: () =>
      agent ? listYourForumBoards({ agent, slingshoturl }) : Promise.resolve([]),
    enabled: status === 'signedIn' && !!agent,
  })

  const subscribedBoardRefs = useMemo(
    () => (yourBoards.data ?? []).map((b) => ({ uri: b.uri, cid: b.cid })),
    [yourBoards.data],
  )

  const subscribedUris = useMemo(
    () => new Set(subscribedBoardRefs.map((b) => b.uri)),
    [subscribedBoardRefs],
  )

  const discovered = useQuery({
    queryKey: ['forum-discover-boards', agent?.did, constellation, slingshoturl],
    queryFn: () => discoverForumBoards({ agent, constellation, slingshoturl }),
    enabled: status === 'signedIn',
  })

  const recommended = useMemo(
    () => (discovered.data ?? []).filter((b) => !subscribedUris.has(b.uri)),
    [discovered.data, subscribedUris],
  )

  const homeTopics = useQuery({
    queryKey: [
      'forum-home-topics',
      subscribedBoardRefs.map((b) => b.uri).join('|'),
      constellation,
      slingshoturl,
    ],
    queryFn: () =>
      listRecentTopicsFromBoards({
        boards: subscribedBoardRefs,
        constellation,
        slingshoturl,
        limit: 40,
      }),
    enabled: subscribedBoardRefs.length > 0,
  })

  const topicRefs = useMemo(
    () => (homeTopics.data ?? []).map((t) => ({ uri: t.uri, cid: t.cid })),
    [homeTopics.data],
  )

  const votes = useQuery({
    queryKey: ['forum-home-votes', topicRefs.map((t) => t.uri).join('|'), agent?.did],
    queryFn: () =>
      listForumVotes({ agent, subjects: topicRefs, constellation, slingshoturl }),
    enabled: topicRefs.length > 0,
  })

  const voteMap = useMemo(() => toStringKeyMap(votes.data), [votes.data])

  const activity = useQuery({
    queryKey: ['forum-home-activity', topicRefs.map((t) => t.uri).join('|')],
    queryFn: async () => {
      const { listForumComments } = await import('@creaton/forum-core')
      const metadata: Record<string, ReturnType<typeof buildForumTopicMetadata>> = {}
      await Promise.all(
        topicRefs.map(async (topic) => {
          const comments = await listForumComments({
            topic,
            constellation,
            slingshoturl,
          })
          const source = (homeTopics.data ?? []).find((t) => t.uri === topic.uri)
          if (source) metadata[topic.uri] = buildForumTopicMetadata(source, comments)
        }),
      )
      return metadata
    },
    enabled: topicRefs.length > 0 && !!homeTopics.data,
  })

  const activityMap = useMemo(() => toStringKeyMap(activity.data), [activity.data])

  const boardLatestActivity = useMemo(
    () =>
      buildBoardLatestActivity(
        yourBoards.data ?? [],
        homeTopics.data ?? [],
        activityMap,
      ),
    [yourBoards.data, homeTopics.data, activityMap],
  )

  const unreadBoardTopics = useMemo(
    () => buildUnreadBoardTopics(homeTopics.data ?? [], activityMap, seenTopics),
    [homeTopics.data, activityMap, seenTopics],
  )

  const boardStories = useMemo(
    () =>
      (yourBoards.data ?? []).flatMap((board) => {
        const parsed = parseAtUri(board.uri)
        if (!parsed) return []
        return [
          {
            uri: board.uri,
            title: board.value.title,
            did: parsed.did,
            rkey: parsed.rkey,
            isUnseen: isForumBoardUnseen(
              board.uri,
              boardLatestActivity,
              seenBoards,
              unreadBoardTopics,
            ),
          },
        ]
      }),
    [boardLatestActivity, seenBoards, unreadBoardTopics, yourBoards.data],
  )

  const sortedTopics = useMemo(() => {
    const metadata = new Map<string, ForumTopicMetadata>()
    for (const [uri, value] of activityMap ?? []) {
      metadata.set(uri, { ...value, vote: voteMap?.get(uri) })
    }
    for (const topic of homeTopics.data ?? []) {
      const existing = metadata.get(topic.uri)
      metadata.set(topic.uri, {
        ...(existing ?? buildForumTopicMetadata(topic, [])),
        vote: voteMap?.get(topic.uri),
      })
    }
    return sortForumTopics(homeTopics.data ?? [], metadata, sort)
  }, [homeTopics.data, activityMap, voteMap, sort])

  const hasBoards = (yourBoards.data ?? []).length > 0
  const loadingBoards = yourBoards.isLoading
  const loadingFeed = homeTopics.isLoading && homeTopics.data === undefined

  return (
    <PageContainer>
      <ForumPage
        title="Forums"
        action={
          <Button size="$3" theme="blue" onPress={() => setCreateOpen(true)}>
            New board
          </Button>
        }
        headerContent={
          status === 'signedIn' ? (
            <ForumBoardStoryRail boards={boardStories} isLoading={loadingBoards} />
          ) : null
        }
      >
        {hasBoards ? (
          <YStack gap="$3">
            <ForumSortPicker value={sort} onChange={setSort} />
            <ForumPanel>
              <ForumSectionHeader title="Recent topics" />
              {loadingFeed ? (
                <Spinner m="$4" />
              ) : sortedTopics.length === 0 ? (
                <ForumEmpty message="No topics in your boards yet." />
              ) : (
                sortedTopics.map((topic) => {
                  const parsed = parseAtUri(topic.uri)
                  const boardParsed = parseAtUri(topic.value.board.uri)
                  if (!parsed || !boardParsed) return null
                  const score = voteMap?.get(topic.uri)?.score ?? 0
                  const meta = activityMap?.get(topic.uri)
                  const isUnread = isForumTopicUnread(
                    topic.uri,
                    topic.value.createdAt,
                    meta,
                    seenTopics,
                  )
                  return (
                    <ForumTopicRow
                      key={topic.uri}
                      href={
                        `/home/forums/${boardParsed.did}/${boardParsed.rkey}/topic/${parsed.did}/${parsed.rkey}` as Href
                      }
                      title={topic.value.title}
                      score={score}
                      isUnread={isUnread}
                      meta={`${meta?.replyCount ?? 0} replies · ${formatForumDate(
                        meta?.latestActivityAt ?? topic.value.createdAt,
                      )}`}
                    />
                  )
                })
              )}
            </ForumPanel>
          </YStack>
        ) : null}

        <ForumPanel>
          <ForumSectionHeader title="Your boards" />
          {loadingBoards ? (
            <Spinner m="$4" />
          ) : !hasBoards ? (
            <ForumEmpty message="You have not joined any boards yet." />
          ) : (
            (yourBoards.data ?? []).map((board) => {
              const parsed = parseAtUri(board.uri)
              if (!parsed) return null
              const isUnread = isForumBoardUnseen(
                board.uri,
                boardLatestActivity,
                seenBoards,
                unreadBoardTopics,
              )
              return (
                <ForumBoardRow
                  key={board.uri}
                  href={`/home/forums/${parsed.did}/${parsed.rkey}` as Href}
                  title={board.value.title}
                  description={board.value.description}
                  isUnread={isUnread}
                />
              )
            })
          )}
        </ForumPanel>

        <ForumPanel>
          <ForumSectionHeader title="Discover" />
          {discovered.isLoading ? (
            <Spinner m="$4" />
          ) : recommended.length === 0 ? (
            <ForumEmpty message="No new boards to discover. Start Microcosm for local dev." />
          ) : (
            recommended.map((board) => {
              const parsed = parseAtUri(board.uri)
              if (!parsed) return null
              return (
                <ForumBoardRow
                  key={board.uri}
                  href={`/home/forums/${parsed.did}/${parsed.rkey}` as Href}
                  title={board.value.title}
                  description={board.value.description}
                />
              )
            })
          )}
        </ForumPanel>
      </ForumPage>

      <CreateBoardSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        agent={agent}
      />
    </PageContainer>
  )
}
