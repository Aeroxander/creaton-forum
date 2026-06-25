import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, type Href } from 'one'
import { useEffect, useMemo, useState } from 'react'
import { Spinner, YStack } from 'tamagui'
import {
  getForumBoard,
  joinForumBoard,
  listForumComments,
  listForumTopics,
  listForumVotes,
  parseAtUri,
} from '@creaton/forum-core'
import { buildForumTopicMetadata, sortForumTopics, type ForumTopicSort } from '@creaton/forum-core'

import { markForumBoardSeen } from '~/features/forums/forumSeen'
import { toStringKeyMap } from '~/features/forums/forumMaps'
import { useForumConfig } from '~/features/forums/useForumQueries'
import { CreateTopicSheet } from '~/features/forums/ui/CreateTopicSheet'
import {
  ForumEmpty,
  ForumPage,
  ForumPanel,
  ForumSectionHeader,
  ForumSortPicker,
  ForumTopicRow,
} from '~/features/forums/ui/ForumChrome'
import { formatForumDate } from '~/features/forums/ui/forumUtils'
import { Button } from '~/interface/buttons/Button'
import { PageContainer } from '~/interface/layout/PageContainer'
import { useAuth } from '~/providers/UnifiedAuthProvider'

export function ForumBoardPage() {
  const params = useLocalSearchParams<{
    boardDid: string
    boardRkey: string
  }>()
  const { agent, status } = useAuth()
  const { constellation, slingshoturl } = useForumConfig()
  const queryClient = useQueryClient()
  const [sort, setSort] = useState<ForumTopicSort>('active')
  const [createOpen, setCreateOpen] = useState(false)

  const boardUri = `at://${params.boardDid}/app.creaton.forum.board/${params.boardRkey}`

  const board = useQuery({
    queryKey: ['forum-board', boardUri, slingshoturl],
    queryFn: () =>
      getForumBoard({
        did: params.boardDid!,
        rkey: params.boardRkey!,
        slingshoturl,
      }),
    enabled: !!params.boardDid && !!params.boardRkey,
  })

  const boardRef = board.data
    ? { uri: board.data.uri, cid: board.data.cid }
    : { uri: boardUri, cid: '' }

  const topics = useQuery({
    queryKey: ['forum-topics', boardRef.uri, constellation, slingshoturl],
    queryFn: () =>
      listForumTopics({
        board: boardRef,
        constellation,
        slingshoturl,
      }),
    enabled: !!board.data,
  })

  const topicSubjects = useMemo(
    () => (topics.data ?? []).map((topic) => ({ uri: topic.uri, cid: topic.cid })),
    [topics.data],
  )

  const votes = useQuery({
    queryKey: ['forum-topic-votes', topicSubjects.map((t) => t.uri).join('|'), agent?.did],
    queryFn: () =>
      listForumVotes({
        agent,
        subjects: topicSubjects,
        constellation,
        slingshoturl,
      }),
    enabled: topicSubjects.length > 0,
  })

  const voteMap = useMemo(() => toStringKeyMap(votes.data), [votes.data])

  const activity = useQuery({
    queryKey: ['forum-topic-activity', topicSubjects.map((t) => t.uri).join('|')],
    queryFn: async () => {
      const metadata: Record<string, ReturnType<typeof buildForumTopicMetadata>> = {}
      await Promise.all(
        topicSubjects.map(async (topic) => {
          const comments = await listForumComments({
            topic,
            constellation,
            slingshoturl,
          })
          const source = (topics.data ?? []).find((item) => item.uri === topic.uri)
          if (source) metadata[topic.uri] = buildForumTopicMetadata(source, comments)
        }),
      )
      return metadata
    },
    enabled: topicSubjects.length > 0 && !!topics.data,
  })

  const activityMap = useMemo(() => toStringKeyMap(activity.data), [activity.data])

  const sortedTopics = useMemo(
    () => sortForumTopics(topics.data ?? [], activityMap, sort),
    [topics.data, activityMap, sort],
  )

  useEffect(() => {
    if (!board.data?.uri) return
    markForumBoardSeen(agent?.did, board.data.uri)
  }, [agent?.did, board.data?.uri])

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['forum-topics', boardRef.uri] })
  }

  const handleJoin = async () => {
    if (!agent || !board.data) return
    await joinForumBoard(agent, { uri: board.data.uri, cid: board.data.cid })
    refresh()
  }

  if (board.isLoading) {
    return (
      <PageContainer>
        <Spinner size="large" />
      </PageContainer>
    )
  }

  if (!board.data) {
    return (
      <PageContainer>
        <ForumEmpty message="Board not found." />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <ForumPage
        title={board.data.value.title}
        action={
          <XStackActions
            agent={agent}
            status={status}
            onJoin={handleJoin}
            onCreate={() => setCreateOpen(true)}
          />
        }
      >
        {board.data.value.description ? (
          <YStack mb="$3" opacity={0.7}>
            {board.data.value.description}
          </YStack>
        ) : null}

        <ForumSortPicker value={sort} onChange={setSort} />

        <ForumPanel>
          <ForumSectionHeader title="Topics" />
          {topics.isLoading && topics.data === undefined ? (
            <Spinner m="$4" />
          ) : sortedTopics.length === 0 ? (
            <ForumEmpty message="No topics yet." />
          ) : (
            sortedTopics.map((topic) => {
              const parsed = parseAtUri(topic.uri)
              if (!parsed) return null
              const vote = voteMap?.get(topic.uri)
              const meta = activityMap?.get(topic.uri)
              return (
                <ForumTopicRow
                  key={topic.uri}
                  href={`/home/forums/${params.boardDid}/${params.boardRkey}/topic/${parsed.did}/${parsed.rkey}` as Href}
                  title={topic.value.title}
                  score={vote?.score ?? 0}
                  meta={`${meta?.replyCount ?? 0} replies · ${formatForumDate(meta?.latestActivityAt ?? topic.value.createdAt)}`}
                />
              )
            })
          )}
        </ForumPanel>
      </ForumPage>

      <CreateTopicSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        agent={agent}
        board={{ uri: board.data.uri, cid: board.data.cid }}
        onCreated={refresh}
      />
    </PageContainer>
  )
}

function XStackActions({
  agent,
  status,
  onJoin,
  onCreate,
}: {
  agent: ReturnType<typeof useAuth>['agent']
  status: ReturnType<typeof useAuth>['status']
  onJoin: () => void
  onCreate: () => void
}) {
  return (
    <YStack gap="$2">
      {status === 'signedIn' && agent ? (
        <>
          <Button size="$3" variant="outlined" onPress={onJoin}>
            Join
          </Button>
          <Button size="$3" theme="blue" onPress={onCreate}>
            New topic
          </Button>
        </>
      ) : null}
    </YStack>
  )
}

export function BoardRoutePage() {
  return <ForumBoardPage />
}
