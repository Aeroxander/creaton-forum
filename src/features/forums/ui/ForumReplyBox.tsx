import { useState } from 'react'
import { SizableText, XStack, YStack } from 'tamagui'
import type { Agent } from '@atproto/api'
import type { DocumentPickerAsset } from 'expo-document-picker'
import {
  createForumComment,
  createEncryptedForumComment,
  createLogosStorageClient,
  policyHashForBoardAccess,
  type ForumAppviewEncryptionParameters,
  type CreatonForumBoardRecord,
  type CreatonForumCommentRecord,
  type ForumRecord,
  type StrongRef,
} from '@creaton/forum-core'

import { getForumStorageUrl, isProductionForumCrypto } from '~/features/forums/crypto/forumCryptoMode'
import { pickForumVideo } from '~/features/forums/video/pickForumVideo'
import { resolveEncryptedBoardVideoInput } from '~/features/forums/video/prepareEncryptedBoardVideo'
import { uploadPublicBoardVideo } from '~/features/forums/video/uploadPublicBoardVideo'
import { useQueryIdentity, useQueryProfile } from '~/features/profile/profileQueries'
import { profileDisplayName, resolveProfilePdsUrl } from '~/features/profile/profileUtils'
import { isWeb } from '~/constants/platform'
import { Button } from '~/interface/buttons/Button'
import { Input } from '~/interface/forms/Input'

export function ForumReplyBox({
  agent,
  topic,
  parent,
  board,
  boardRecord,
  encryptionParams,
  canPost = true,
  replyTargetAuthorDid,
  onCancelReply,
  onReplied,
}: {
  agent: Agent | null
  topic: StrongRef
  parent?: StrongRef
  board?: StrongRef
  boardRecord?: CreatonForumBoardRecord
  encryptionParams?: ForumAppviewEncryptionParameters
  canPost?: boolean
  replyTargetAuthorDid?: string
  onCancelReply?: () => void
  onReplied?: (comment: ForumRecord<CreatonForumCommentRecord>) => void
}) {
  const [reply, setReply] = useState('')
  const [attachments, setAttachments] = useState<File[]>([])
  const [webVideoFile, setWebVideoFile] = useState<File | null>(null)
  const [nativeVideo, setNativeVideo] = useState<DocumentPickerAsset | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [uploadStatus, setUploadStatus] = useState('')
  const profile = useQueryProfile(replyTargetAuthorDid, agent)
  const identity = useQueryIdentity(replyTargetAuthorDid, agent)

  const isEncrypted = boardRecord?.postingMode === 'encrypted'
  const videoName = isWeb ? webVideoFile?.name ?? null : nativeVideo?.name ?? null

  const replyTargetName =
    replyTargetAuthorDid &&
    profileDisplayName({
      profile: profile.data?.value,
      identity: identity.data,
      did: replyTargetAuthorDid,
    })

  const handleReply = async () => {
    if (!agent || !reply.trim() || !canPost) return
    if (isEncrypted && !board) return
    setBusy(true)
    setError('')
    setUploadStatus('')
    try {
      const committeeEpoch = isProductionForumCrypto()
        ? encryptionParams?.committeeEpoch
        : 1
      const pdsUrl = resolveProfilePdsUrl({ agent, did: agent.did })
      const videoSource = isWeb ? webVideoFile : nativeVideo
      if (videoSource && !pdsUrl) {
        throw new Error('Could not resolve your PDS URL for video upload.')
      }
      const encryptedVideo =
        isEncrypted && videoSource
          ? await resolveEncryptedBoardVideoInput(agent, videoSource, pdsUrl, setUploadStatus)
          : undefined
      const comment = isEncrypted
        ? await createEncryptedForumComment(agent, {
            board: board!,
            topic,
            parent,
            body: reply.trim(),
            encryption: {
              committeeEpoch: committeeEpoch ?? 1,
              policyHash:
                encryptionParams?.policyHash ??
                (await policyHashForBoardAccess(boardRecord?.access)),
              committeePublicKey: encryptionParams?.committeePublicKey,
            },
            attachments: attachments.length ? attachments : undefined,
            logosClient:
              attachments.length > 0 ? createLogosStorageClient(getForumStorageUrl()) : undefined,
            encryptedVideo,
          })
        : await (async () => {
            let video
            const pdsUrl = resolveProfilePdsUrl({ agent, did: agent.did })
            if ((isWeb && webVideoFile) || (!isWeb && nativeVideo)) {
              if (!pdsUrl) {
                throw new Error('Could not resolve your PDS URL for video upload.')
              }
            }
            if (isWeb && webVideoFile && pdsUrl) {
              video = await uploadPublicBoardVideo(agent, webVideoFile, pdsUrl, setUploadStatus)
            } else if (!isWeb && nativeVideo && pdsUrl) {
              video = await uploadPublicBoardVideo(agent, nativeVideo, pdsUrl, setUploadStatus)
            }
            return createForumComment(agent, {
              topic,
              parent,
              body: reply.trim(),
              video,
            })
          })()
      setReply('')
      setAttachments([])
      setWebVideoFile(null)
      setNativeVideo(null)
      onReplied?.(comment)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to post reply.')
    } finally {
      setBusy(false)
      setUploadStatus('')
    }
  }

  return (
    <YStack px="$4" py="$3" gap="$2" borderTopWidth={1} borderColor="$color5">
      <XStack gap="$2" items="center" flexWrap="wrap">
        <SizableText size="$4" fontWeight="600">
          {replyTargetName ? `Reply to ${replyTargetName}` : 'Reply'}
        </SizableText>
        {replyTargetName && onCancelReply ? (
          <Button size="$2" variant="transparent" onPress={onCancelReply}>
            Cancel
          </Button>
        ) : null}
      </XStack>
      {!canPost ? (
        <SizableText size="$3" color="$orange10">
          Subscribe to this board before posting encrypted replies.
        </SizableText>
      ) : null}
      {error ? (
        <SizableText size="$3" color="$red10">
          {error}
        </SizableText>
      ) : null}
      {uploadStatus ? (
        <SizableText size="$2" opacity={0.7}>
          {uploadStatus}
        </SizableText>
      ) : null}
      <Input
        placeholder={agent ? 'Write a reply' : 'Sign in to reply'}
        value={reply}
        onChangeText={setReply}
        multiline
        readOnly={!agent || busy || !canPost}
      />
      {isEncrypted && attachments.length ? (
        <YStack gap="$1">
          {attachments.map((file, index) => (
            <XStack key={`${file.name}-${index}`} gap="$2" items="center">
              <SizableText size="$2" flex={1}>
                {file.name}
              </SizableText>
              <Button
                size="$2"
                variant="outlined"
                onPress={() => setAttachments((current) => current.filter((_, i) => i !== index))}
              >
                Remove
              </Button>
            </XStack>
          ))}
        </YStack>
      ) : null}
      {isEncrypted ? (
        <input
          type="file"
          multiple
          style={{ display: 'none' }}
          id="forum-reply-attachments"
          onChange={(event) => {
            if (!event.target.files) return
            setAttachments((current) => [...current, ...Array.from(event.target.files!)])
          }}
        />
      ) : null}
      {videoName ? (
        <XStack gap="$2" items="center">
          <SizableText size="$2" flex={1}>
            {videoName}
          </SizableText>
          <Button
            size="$2"
            variant="outlined"
            disabled={busy}
            onPress={() => {
              setWebVideoFile(null)
              setNativeVideo(null)
            }}
          >
            Remove video
          </Button>
        </XStack>
      ) : null}
      {isEncrypted ? (
        <Button
          size="$2"
          variant="outlined"
          disabled={!canPost}
          onPress={() => document.getElementById('forum-reply-attachments')?.click()}
        >
          Add attachments
        </Button>
      ) : null}
      <Button
        size="$2"
        variant="outlined"
        disabled={!canPost || busy}
        onPress={() => {
          if (isWeb) {
            document.getElementById('forum-reply-video')?.click()
            return
          }
          void pickForumVideo()
            .then((picked) => {
              if (picked) setNativeVideo(picked)
            })
            .catch((cause) => {
              setError(cause instanceof Error ? cause.message : 'Failed to pick video.')
            })
        }}
      >
        Add video
      </Button>
      {isWeb ? (
        <input
          type="file"
          accept="video/*"
          style={{ display: 'none' }}
          id="forum-reply-video"
          onChange={(event) => {
            setWebVideoFile(event.target.files?.[0] ?? null)
            event.target.value = ''
          }}
        />
      ) : null}
      <Button
        theme="blue"
        disabled={!agent || busy || !reply.trim() || !canPost}
        onPress={handleReply}
      >
        Post reply
      </Button>
    </YStack>
  )
}
