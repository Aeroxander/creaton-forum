import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams } from 'one'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Spinner, YStack } from 'tamagui'
import {
  buildCommentTree,
  getForumBoard,
  getForumTopic,
  listForumComments,
  listForumVotes,
  mergeForumRecords,
  parseAtUri,
  type CreatonForumBoardRecord,
  type CreatonForumCommentRecord,
  type CreatonForumEncryptedContentV3,
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
import { CommunityBoardAccessPanel } from '~/features/onramp/CommunityBoardAccessPanel'
import { PageContainer } from '~/interface/layout/PageContainer'
import { useAuth } from '~/providers/UnifiedAuthProvider'
import { isProductionForumCrypto } from '~/features/forums/crypto/forumCryptoMode'
import { useCanAccessForumBoard } from '~/features/forums/useForumBoardAccess'
import { useForumEncryptionParameters } from '~/features/forums/useForumEncryptionParameters'
import { useForumUnlock } from '~/features/forums/useForumUnlock'
import { useWalletUsdcBalance } from '~/features/onramp/useWalletUsdcBalance'

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
  const [decryptedBodies, setDecryptedBodies] = useState<Record<string, string>>({})
  const [unlockingUri, setUnlockingUri] = useState<string | null>(null)
  const wallet = useWalletUsdcBalance()

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

  const boardUri = topic.data?.value.board?.uri
  const boardParams = useMemo(() => {
    if (!boardUri) return null
    const parsed = parseAtUri(boardUri)
    if (!parsed) return null
    return { did: parsed.did, rkey: parsed.rkey, uri: boardUri }
  }, [boardUri])

  const board = useQuery({
    queryKey: ['forum-board', boardParams?.uri, slingshoturl],
    queryFn: async () => {
      const result = await getForumBoard({
        did: boardParams!.did,
        rkey: boardParams!.rkey,
        slingshoturl,
      })
      return result as ForumRecord<CreatonForumBoardRecord>
    },
    enabled: !!boardParams,
  })

  const participantIds = useMemo(
    () =>
      !isProductionForumCrypto() && agent?.did ? [agent.did] : undefined,
    [agent?.did],
  )

  const boardAccess = useCanAccessForumBoard({
    boardUri: boardParams?.uri ?? '',
    boardRecord: board.data?.value,
  })
  const encryptionParams = useForumEncryptionParameters(
    boardParams?.uri ?? '',
    board.data?.value,
  )
  const { unlockMutation } = useForumUnlock(boardParams?.uri ?? '')
  const access = board.data?.value.access

  const fundWallet = useMemo(() => {
    if (!access || access.paymentProtocol === 'tempo') return undefined
    return {
      did: agent?.did,
      walletAddress: wallet.address,
      balance: wallet.balance,
      requiredAmount: access.amount,
      onFunded: () => void wallet.refetch(),
    }
  }, [access, agent?.did, wallet.address, wallet.balance, wallet.refetch])

  const unlockPost = useCallback(
    (input: {
      recordUri: string
      recordType: 'topic' | 'comment'
      protectedBody: CreatonForumEncryptedContentV3
    }) => {
      if (!boardParams?.uri || !access) return
      setUnlockingUri(input.recordUri)
      unlockMutation.mutate(
        {
          boardUri: boardParams.uri,
          recordUri: input.recordUri,
          recordType: input.recordType,
          protectedBody: input.protectedBody,
          access,
        },
        {
          onSuccess: (plaintext) => {
            setDecryptedBodies((current) => ({ ...current, [input.recordUri]: plaintext }))
            setUnlockingUri(null)
          },
          onError: () => setUnlockingUri(null),
        },
      )
    },
    [access, boardParams?.uri, unlockMutation],
  )

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

  const topicRecord = topic.data
  const topicScore = voteMap?.get(topicRecord.uri)?.score ?? 0
  const topicAuthor = authorDidFromUri(topicRecord.uri)

  return (
    <PageContainer>
      <ForumPage title={topicRecord.value.title}>
        {access?.paymentProtocol === 'mpp' ? (
          <YStack mb="$3" display="flex" $md={{ display: 'none' }}>
            <CommunityBoardAccessPanel access={access} />
          </YStack>
        ) : null}
        <ForumPanel>
          <ForumSectionHeader title="Discussion" />
          <ForumPost
            agent={agent}
            kind="topic"
            record={topicRecord}
            authorDid={topicAuthor}
            score={topicScore}
            boardUri={boardParams?.uri}
            access={access}
            hasBoardAccess={boardAccess.hasAccess}
            participantIds={participantIds}
            decryptedBody={decryptedBodies[topicRecord.uri]}
            fundWallet={fundWallet}
            unlocking={unlockingUri === topicRecord.uri}
            onUnlock={
              topicRecord.value.protectedBody
                ? () =>
                    unlockPost({
                      recordUri: topicRecord.uri,
                      recordType: 'topic',
                      protectedBody: topicRecord.value.protectedBody as CreatonForumEncryptedContentV3,
                    })
                : undefined
            }
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
                boardUri={boardParams?.uri}
                access={access}
                hasBoardAccess={boardAccess.hasAccess}
                voteScores={commentScores}
                participantIds={participantIds}
                decryptedBodies={decryptedBodies}
                fundWallet={fundWallet}
                unlockingUri={unlockingUri}
                onUnlockComment={(comment) => {
                  if (!comment.value.protectedBody) return
                  unlockPost({
                    recordUri: comment.uri,
                    recordType: 'comment',
                    protectedBody: comment.value.protectedBody as CreatonForumEncryptedContentV3,
                  })
                }}
                onVoted={refreshVotes}
                onReply={setReplyTarget}
              />
            ))
          )}
          <ForumReplyBox
            agent={agent}
            topic={topicRef!}
            board={board.data ? { uri: board.data.uri, cid: board.data.cid } : undefined}
            boardRecord={board.data?.value}
            encryptionParams={encryptionParams.data}
            canPost={boardAccess.hasAccess}
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
