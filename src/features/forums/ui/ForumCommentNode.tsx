import { useState } from 'react'
import { YStack } from 'tamagui'
import type { Agent } from '@atproto/api'
import {
  countDescendants,
  forumRecordAuthorDid,
  type CommentTreeNode,
  type CreatonForumAccessPolicy,
  type CreatonForumCommentRecord,
  type ForumRecord,
} from '@creaton/forum-core'

import { authorDidFromUri, forumThreadMarginLeft } from '~/features/forums/ui/forumUtils'
import { ForumPost } from '~/features/forums/ui/ForumPost'
import { Button } from '~/interface/buttons/Button'

const MAX_VISUAL_DEPTH = 8

export function ForumCommentNode({
  node,
  agent,
  depth = 0,
  connectToParent = false,
  followsTopic = false,
  boardUri,
  access,
  hasBoardAccess,
  participantIds,
  decryptedBodies,
  fundWallet,
  unlockingUri,
  onUnlockComment,
  voteScores,
  onVoted,
  onReply,
}: {
  node: CommentTreeNode
  agent: Agent | null
  depth?: number
  connectToParent?: boolean
  followsTopic?: boolean
  boardUri?: string
  access?: CreatonForumAccessPolicy
  hasBoardAccess?: boolean
  participantIds?: string[]
  decryptedBodies?: Record<string, string>
  fundWallet?: {
    did: string | undefined
    walletAddress: string | undefined
    balance?: bigint
    requiredAmount: string | bigint
    onFunded?: () => void
  }
  unlockingUri?: string | null
  onUnlockComment?: (comment: ForumRecord<CreatonForumCommentRecord>) => void
  voteScores: Map<string, number> | undefined
  onVoted: () => void
  onReply: (comment: ForumRecord<CreatonForumCommentRecord>) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const author = authorDidFromUri(node.comment.uri)
  const score = voteScores?.get(node.comment.uri) ?? node.score.score
  const childCount = countDescendants(node)
  const hasChildren = node.children.length > 0
  const visualDepth = Math.min(depth, MAX_VISUAL_DEPTH)
  const showingChildren = !collapsed && hasChildren

  return (
    <YStack>
      <ForumPost
        agent={agent}
        kind="comment"
        record={node.comment}
        authorDid={author}
        score={score}
        depth={visualDepth}
        mergeTop={connectToParent}
        mergeBottom={showingChildren}
        followsTopic={followsTopic}
        boardUri={boardUri}
        access={access}
        hasBoardAccess={hasBoardAccess}
        participantIds={participantIds}
        decryptedBody={decryptedBodies?.[node.comment.uri]}
        fundWallet={fundWallet}
        unlocking={unlockingUri === node.comment.uri}
        onUnlock={
          onUnlockComment && node.comment.value.protectedBody
            ? () => onUnlockComment(node.comment)
            : undefined
        }
        onVoted={onVoted}
        onReply={() => onReply(node.comment)}
      />
      {hasChildren && collapsed ? (
        <YStack ml={forumThreadMarginLeft(visualDepth)} pl={visualDepth > 0 ? 0 : '$4'} pb="$2">
          <Button size="$2" variant="transparent" onPress={() => setCollapsed(false)}>
            {`Expand ${childCount} ${childCount === 1 ? 'reply' : 'replies'}`}
          </Button>
        </YStack>
      ) : null}
      {showingChildren ? (
        <>
          {node.children.map((child, index) => (
            <ForumCommentNode
              key={child.comment.uri}
              node={child}
              agent={agent}
              depth={depth + 1}
              connectToParent={index === 0}
              boardUri={boardUri}
              access={access}
              hasBoardAccess={hasBoardAccess}
              participantIds={participantIds}
              decryptedBodies={decryptedBodies}
              fundWallet={fundWallet}
              unlockingUri={unlockingUri}
              onUnlockComment={onUnlockComment}
              voteScores={voteScores}
              onVoted={onVoted}
              onReply={onReply}
            />
          ))}
          <YStack ml={forumThreadMarginLeft(visualDepth)} pl={visualDepth > 0 ? 0 : '$4'} pb="$2">
            <Button size="$2" variant="transparent" onPress={() => setCollapsed(true)}>
              Collapse thread
            </Button>
          </YStack>
        </>
      ) : null}
    </YStack>
  )
}

export function forumReplyTargetLabel(comment: ForumRecord<CreatonForumCommentRecord>) {
  return forumRecordAuthorDid(comment.uri)
}
