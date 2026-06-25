import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams } from 'one'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Spinner, YStack } from 'tamagui'
import {
  buildCommentTree,
  getForumTopic,
  listForumComments,
  listForumVotes,
  mergeForumRecords,
  type CreatonForumCommentRecord,
  type ForumRecord,
} from '@creaton/forum-core'

import { markForumBoardSeen, markForumTopicSeen } from '~/features/forums/forumSeen'
import { toStringKeyMap } from '~/features/forums/forumMaps'
import { useForumConfig } from '~/features/forums/useForumQueries'
import { authorDidFromUri } from '~/features/forums/ui/forumUtils'
import { ForumCommentNode, forumReplyTargetLabel } from '~/features/forums/ui/ForumCommentNode'
import { ForumEmpty, ForumPage, ForumPanel, ForumSectionHeader } from '~/features/forums/ui/ForumChrome'
import { ForumPost } from '~/features/forums/ui/ForumPost'
import { ForumReplyBox } from '~/features/forums/ui/ForumReplyBox'
import { PageContainer } from '~/interface/layout/PageContainer'
import { useAuth } from '~/providers/UnifiedAuthProvider'

export function ForumTopicPage() {
  const params = useLocalSearchParams<{
    boardDid: string
    boardRkey: string
    topicDid: string
    topicRkey: string
  }>()
  const { agent } = useAuth()
  const { constellation, slingshoturl } = useForumConfig()
  const queryClient = useQueryClient()
  const [replyTarget, setReplyTarget] = useState<ForumRecord<CreatonForumCommentRecord> | null>(
    null,
  )

  const topic = useQuery({
    queryKey: ['forum-topic', params.topicDid, params.topicRkey, slingshoturl],
    queryFn: () =>
      getForumTopic({
        did: params.topicDid!,
        rkey: params.topicRkey!,
        slingshoturl,
      }),
    enabled: !!params.topicDid && !!params.topicRkey,
  })

  const topicRef = useMemo(
    () =>
      topic.data
        ? { uri: topic.data.uri, cid: topic.data.cid }
        : null,
    [topic.data?.cid, topic.data?.uri],
  )

  const commentsQueryKey = useMemo(
    () =>
      [
        'forum-comments',
        topicRef?.uri,
        agent?.did ?? 'signed-out',
        constellation,
        slingshoturl,
      ] as const,
    [agent?.did, constellation, slingshoturl, topicRef?.uri],
  )

  const comments = useQuery({
    queryKey: commentsQueryKey,
    queryFn: async () => {
      const fetched = await listForumComments({
        topic: topicRef!,
        constellation,
        slingshoturl,
      })
      const cached = queryClient.getQueryData<ForumRecord<CreatonForumCommentRecord>[]>(
        commentsQueryKey,
      )
      return mergeForumRecords(fetched, cached)
    },
    enabled: !!topicRef,
    staleTime: 60 * 1000,
  })

  const voteSubjects = useMemo(() => {
    if (!topicRef) return []
    const commentRefs = (comments.data ?? []).map((comment) => ({
      uri: comment.uri,
      cid: comment.cid,
    }))
    return [topicRef, ...commentRefs]
  }, [topicRef, comments.data])

  const votes = useQuery({
    queryKey: [
      'forum-votes',
      voteSubjects.map((subject) => subject.uri).join(','),
      agent?.did,
      constellation,
      slingshoturl,
    ],
    queryFn: () =>
      listForumVotes({
        agent,
        subjects: voteSubjects,
        constellation,
        slingshoturl,
      }),
    enabled: voteSubjects.length > 0,
  })

  const voteMap = useMemo(() => toStringKeyMap(votes.data), [votes.data])

  const commentTree = useMemo(
    () => buildCommentTree(comments.data ?? [], voteMap, 'chronological'),
    [comments.data, voteMap],
  )

  const commentScores = useMemo(() => {
    const scores = new Map<string, number>()
    for (const [uri, summary] of voteMap?.entries() ?? []) {
      scores.set(uri, summary.score)
    }
    return scores
  }, [voteMap])

  useEffect(() => {
    const boardUri = topic.data?.value.board?.uri
    if (!boardUri) return
    markForumBoardSeen(agent?.did, boardUri)
  }, [agent?.did, topic.data?.value.board?.uri])

  useEffect(() => {
    if (!topic.data?.uri) return
    markForumTopicSeen(agent?.did, topic.data.uri)
  }, [agent?.did, topic.data?.uri])

  const handleReplied = useCallback(
    (comment: ForumRecord<CreatonForumCommentRecord>) => {
      queryClient.setQueryData<ForumRecord<CreatonForumCommentRecord>[]>(
        commentsQueryKey,
        (existing = []) => {
          if (existing.some((item) => item.uri === comment.uri)) return existing
          return [...existing, comment].sort((a, b) =>
            a.value.createdAt.localeCompare(b.value.createdAt),
          )
        },
      )
      setReplyTarget(null)
      void queryClient.invalidateQueries({ queryKey: ['forum-votes'] })
      if (topic.data?.uri) markForumTopicSeen(agent?.did, topic.data.uri)
    },
    [agent?.did, commentsQueryKey, queryClient, topic.data?.uri],
  )

  const refreshVotes = () => {
    void queryClient.invalidateQueries({ queryKey: ['forum-votes'] })
  }

  if (topic.isLoading) {
    return (
      <PageContainer>
        <Spinner size="large" />
      </PageContainer>
    )
  }

  if (!topic.data) {
    return (
      <PageContainer>
        <ForumEmpty message="Topic not found." />
      </PageContainer>
    )
  }

  const topicScore = voteMap?.get(topic.data.uri)?.score ?? 0
  const topicAuthor = authorDidFromUri(topic.data.uri)

  return (
    <PageContainer>
      <ForumPage title={topic.data.value.title}>
        <ForumPanel>
          <ForumSectionHeader title="Discussion" />
          <ForumPost
            agent={agent}
            kind="topic"
            record={topic.data}
            authorDid={topicAuthor}
            score={topicScore}
            onVoted={refreshVotes}
          />
          {comments.isLoading ? (
            <YStack py="$4" items="center">
              <Spinner size="small" />
            </YStack>
          ) : commentTree.length === 0 ? (
            <ForumEmpty message="No replies yet — be the first to respond." />
          ) : (
            commentTree.map((node, index) => (
              <ForumCommentNode
                key={node.comment.uri}
                node={node}
                agent={agent}
                followsTopic={index === 0}
                voteScores={commentScores}
                onVoted={refreshVotes}
                onReply={setReplyTarget}
              />
            ))
          )}
          <ForumReplyBox
            agent={agent}
            topic={topicRef!}
            parent={
              replyTarget ? { uri: replyTarget.uri, cid: replyTarget.cid } : undefined
            }
            replyTargetAuthorDid={
              replyTarget ? forumReplyTargetLabel(replyTarget) : undefined
            }
            onCancelReply={() => setReplyTarget(null)}
            onReplied={handleReplied}
          />
        </ForumPanel>
      </ForumPage>
    </PageContainer>
  )
}

export function TopicRoutePage() {
  return <ForumTopicPage />
}
