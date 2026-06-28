import { useState } from 'react'
import { SizableText, XStack, YStack } from 'tamagui'
import type { Agent } from '@atproto/api'
import {
  voteOnForumSubject,
  type CreatonForumAccessPolicy,
  type CreatonForumEncryptedContentV3,
  type ForumRecord,
  type CreatonForumCommentRecord,
  type CreatonForumTopicRecord,
} from '@creaton/forum-core'

import { isProductionForumCrypto } from '~/features/forums/crypto/forumCryptoMode'
import {
  classifyForumDecryptionError,
  useDecryptedForumBody,
} from '~/features/forums/useForumDecryption'
import { useForumKarma } from '~/features/forums/useForumKarma'
import { useQueryIdentity, useQueryProfile } from '~/features/profile/profileQueries'
import {
  getProfileAvatarUrl,
  profileDisplayName,
  resolveProfilePdsUrl,
} from '~/features/profile/profileUtils'
import { Avatar } from '~/interface/avatars/Avatar'
import { Button } from '~/interface/buttons/Button'
import { formatForumDate, forumThreadMarginLeft } from '~/features/forums/ui/forumUtils'
import { ForumMarkdown } from '~/features/forums/ui/ForumMarkdown'
import { ForumAttachmentList } from '~/features/forums/ui/ForumAttachmentList'
import { ForumVideoAttachment } from '~/features/forums/ui/video/ForumVideoAttachment'
import { ProtectedForumBody } from '~/features/forums/ui/ProtectedForumBody'

type PostKind = 'topic' | 'comment'

export function ForumPost({
  agent,
  kind,
  record,
  authorDid,
  score = 0,
  depth = 0,
  mergeTop = false,
  mergeBottom = false,
  followsTopic = false,
  boardUri,
  access,
  hasBoardAccess,
  participantIds,
  decryptedBody,
  fundWallet,
  unlocking,
  onUnlock,
  onVoted,
  onReply,
}: {
  agent: Agent | null
  kind: PostKind
  record: ForumRecord<CreatonForumTopicRecord | CreatonForumCommentRecord>
  authorDid: string
  score?: number
  depth?: number
  mergeTop?: boolean
  mergeBottom?: boolean
  followsTopic?: boolean
  boardUri?: string
  access?: CreatonForumAccessPolicy
  hasBoardAccess?: boolean
  participantIds?: string[]
  decryptedBody?: string
  fundWallet?: {
    did: string | undefined
    walletAddress: string | undefined
    balance?: bigint
    requiredAmount: string | bigint
    onFunded?: () => void
  }
  unlocking?: boolean
  onUnlock?: () => void
  onVoted?: () => void
  onReply?: () => void
}) {
  const profile = useQueryProfile(authorDid, agent)
  const identity = useQueryIdentity(authorDid, agent)
  const karma = useForumKarma(authorDid)
  const [busy, setBusy] = useState(false)

  const protectedBody =
    'protectedBody' in record.value
      ? (record.value.protectedBody as CreatonForumEncryptedContentV3 | undefined)
      : undefined
  const protectedAttachments =
    'protectedAttachments' in record.value ? record.value.protectedAttachments : undefined

  const isMppUnlock =
    isProductionForumCrypto() && access?.paymentProtocol === 'mpp' && !!protectedBody

  const decrypted = useDecryptedForumBody({
    protectedBody,
    boardUri,
    recordUri: record.uri,
    recordType: kind,
    access,
    hasBoardAccess,
    participantIds,
    enabled: !isMppUnlock && decryptedBody === undefined,
  })

  const decryptErrorKind =
    decrypted.isError && decrypted.error instanceof Error
      ? classifyForumDecryptionError(decrypted.error.message)
      : null

  const resolvedBody =
    decryptedBody ??
    ('body' in record.value && record.value.body ? record.value.body : undefined) ??
    decrypted.data

  const showProtectedPlaceholder = !!protectedBody && !resolvedBody

  const title = 'title' in record.value ? record.value.title : undefined

  const handleVote = async (direction: 'up' | 'down') => {
    if (!agent) return
    setBusy(true)
    try {
      await voteOnForumSubject(agent, {
        subject: { uri: record.uri, cid: record.cid },
        direction,
      })
      onVoted?.()
    } finally {
      setBusy(false)
    }
  }

  const displayName = profileDisplayName({
    profile: profile.data?.value,
    identity: identity.data,
    did: authorDid,
  })

  const avatarUrl = getProfileAvatarUrl({
    did: authorDid,
    blob: profile.data?.value?.avatar,
    pdsUrl: resolveProfilePdsUrl({
      identityPds: identity.data?.pds,
      agent,
      did: authorDid,
    }),
  })

  const authorPdsUrl = resolveProfilePdsUrl({
    identityPds: identity.data?.pds,
    agent,
    did: authorDid,
  })

  const video = 'video' in record.value ? record.value.video : undefined

  const showScore = kind === 'topic' || score !== 0
  const nested = kind === 'comment' && depth > 0

  const postBody = (
    <>
      <XStack gap="$3" items="flex-start">
        <YStack width={42} items="center" gap="$1">
          <Avatar image={avatarUrl} name={displayName} size={42} />
          {karma.data ? (
            <SizableText size="$1" opacity={0.6} text="center">
              {Math.round(karma.data.totalKarma)} karma
            </SizableText>
          ) : null}
        </YStack>
        <YStack flex={1} gap="$1">
          <SizableText size="$3" fontWeight="600">
            {displayName}
          </SizableText>
          <SizableText size="$2" opacity={0.5}>
            {formatForumDate(record.value.createdAt)}
          </SizableText>
        </YStack>
      </XStack>

      {title ? (
        <SizableText size="$6" fontWeight="700">
          {title}
        </SizableText>
      ) : null}

      {resolvedBody ? <ForumMarkdown body={resolvedBody} /> : null}

      {video ? (
        <ForumVideoAttachment
          authorDid={authorDid}
          video={video}
          pdsUrl={authorPdsUrl}
          boardUri={boardUri}
          recordUri={record.uri}
          recordType={kind}
          protectedBody={protectedBody}
          access={access}
        />
      ) : null}

      {showProtectedPlaceholder ? (
        isMppUnlock || onUnlock ? (
          <ProtectedForumBody
            fundWallet={fundWallet}
            onUnlock={onUnlock}
            unlocking={unlocking || decrypted.isLoading}
            paymentProtocol={access?.paymentProtocol}
          />
        ) : (
          <SizableText size="$3" opacity={0.7}>
            {decrypted.isLoading
              ? '[Unlocking encrypted content…]'
              : decryptErrorKind === 'subscribe'
                ? '[Encrypted content — subscribe on the board page to unlock]'
                : decryptErrorKind === 'funding'
                  ? '[Encrypted content — add USDC to your wallet to unlock]'
                  : '[Encrypted content — subscribe to unlock]'}
          </SizableText>
        )
      ) : null}

      {protectedAttachments?.length && boardUri ? (
        <ForumAttachmentList
          attachments={protectedAttachments}
          boardUri={boardUri}
          recordUri={record.uri}
          recordType={kind}
          protectedBody={protectedBody}
          access={access}
        />
      ) : null}

      <XStack gap="$2" items="center" flexWrap="wrap">
        <Button size="$2" disabled={!agent || busy} onPress={() => handleVote('up')}>
          {showScore ? `▲ ${score}` : 'Upvote'}
        </Button>
        <Button size="$2" disabled={!agent || busy} onPress={() => handleVote('down')}>
          Downvote
        </Button>
        {onReply ? (
          <Button size="$2" variant="transparent" disabled={!agent} onPress={onReply}>
            Reply
          </Button>
        ) : null}
      </XStack>
    </>
  )

  if (nested) {
    const showTopBorder = !mergeTop

    return (
      <YStack
        ml={forumThreadMarginLeft(depth)}
        mr="$3"
        mb={mergeBottom ? 0 : '$2'}
        mt={showTopBorder ? '$3' : 0}
      >
        <YStack
          p="$3"
          gap="$3"
          rounded="$3"
          borderWidth={1}
          borderTopWidth={showTopBorder ? 1 : 0}
          borderBottomWidth={0}
          borderRightWidth={0}
          borderTopLeftRadius={mergeTop ? 0 : '$3'}
          borderTopRightRadius={0}
          borderBottomLeftRadius={mergeBottom ? 0 : '$3'}
          borderBottomRightRadius={0}
          borderLeftWidth={3}
          borderColor="$color5"
          bg="$color2"
        >
          {postBody}
        </YStack>
      </YStack>
    )
  }

  const showTopBorder = kind === 'comment' && !mergeTop && !followsTopic

  return (
    <YStack
      px="$4"
      py="$3"
      gap="$3"
      mt={showTopBorder ? '$3' : 0}
      borderTopWidth={showTopBorder ? 1 : 0}
      borderBottomWidth={kind === 'topic' ? 1 : 0}
      borderColor="$color5"
      bg={kind === 'topic' ? '$color2' : '$background'}
    >
      {postBody}
    </YStack>
  )
}
