import { useState } from 'react'
import type { Agent } from '@atproto/api'
import type { DocumentPickerAsset } from 'expo-document-picker'
import {
  createForumTopic,
  createEncryptedForumTopic,
  createLogosStorageClient,
  policyHashForBoardAccess,
  type ForumAppviewEncryptionParameters,
  type CreatonForumBoardRecord,
  type StrongRef,
} from '@creaton/forum-core'
import { Dialog, Sheet, SizableText, useMedia, XStack, YStack } from 'tamagui'

import { getForumStorageUrl, isProductionForumCrypto } from '~/features/forums/crypto/forumCryptoMode'
import { pickForumVideo } from '~/features/forums/video/pickForumVideo'
import { resolveEncryptedBoardVideoInput } from '~/features/forums/video/prepareEncryptedBoardVideo'
import { uploadPublicBoardVideo } from '~/features/forums/video/uploadPublicBoardVideo'
import { resolveProfilePdsUrl } from '~/features/profile/profileUtils'
import { isWeb } from '~/constants/platform'
import { Button } from '~/interface/buttons/Button'
import { Input } from '~/interface/forms/Input'

import { ClientSheet } from './ClientSheet'

function CreateTopicForm({
  title,
  setTitle,
  body,
  setBody,
  agent,
  busy,
  canPost,
  gateMessage,
  uploadStatus,
  isEncrypted,
  attachments,
  videoName,
  onPickAttachments,
  onRemoveAttachment,
  onAddVideo,
  onRemoveVideo,
  onCreate,
}: {
  title: string
  setTitle: (value: string) => void
  body: string
  setBody: (value: string) => void
  agent: Agent | null
  busy: boolean
  canPost: boolean
  gateMessage?: string
  uploadStatus?: string
  isEncrypted: boolean
  attachments: File[]
  videoName: string | null
  onPickAttachments: (files: FileList | null) => void
  onRemoveAttachment: (index: number) => void
  onAddVideo: () => void
  onRemoveVideo: () => void
  onCreate: () => void
}) {
  return (
    <YStack gap="$3">
      <SizableText size="$6" fontWeight="700">
        Create a new topic
      </SizableText>

      {gateMessage ? (
        <SizableText size="$3" color="$orange10">
          {gateMessage}
        </SizableText>
      ) : null}

      {uploadStatus ? (
        <SizableText size="$2" opacity={0.7}>
          {uploadStatus}
        </SizableText>
      ) : null}

      <Input placeholder="Topic title" value={title} onChangeText={setTitle} />
      <Input
        placeholder="Body (optional)"
        value={body}
        onChangeText={setBody}
        multiline
        height={120}
      />

      {isEncrypted && attachments.length ? (
        <YStack gap="$1">
          {attachments.map((file, index) => (
            <XStack key={`${file.name}-${index}`} gap="$2" items="center">
              <SizableText size="$2" flex={1}>
                {file.name}
              </SizableText>
              <Button size="$2" variant="outlined" onPress={() => onRemoveAttachment(index)}>
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
          id="create-topic-attachments"
          onChange={(event) => onPickAttachments(event.target.files)}
        />
      ) : null}

      {videoName ? (
        <XStack gap="$2" items="center">
          <SizableText size="$2" flex={1}>
            {videoName}
          </SizableText>
          <Button size="$2" variant="outlined" disabled={busy} onPress={onRemoveVideo}>
            Remove video
          </Button>
        </XStack>
      ) : null}

      {isEncrypted ? (
        <Button
          size="$2"
          variant="outlined"
          disabled={!canPost}
          onPress={() => document.getElementById('create-topic-attachments')?.click()}
        >
          Add attachments
        </Button>
      ) : null}

      <Button
        size="$2"
        variant="outlined"
        disabled={!canPost || busy}
        onPress={onAddVideo}
      >
        Add video
      </Button>

      <Button
        theme="blue"
        disabled={!agent || busy || !title.trim() || !canPost}
        onPress={onCreate}
      >
        {busy ? 'Creating...' : 'Create topic'}
      </Button>
    </YStack>
  )
}

export function CreateTopicSheet({
  open,
  onOpenChange,
  agent,
  board,
  boardRecord,
  encryptionParams,
  canPost = true,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  agent: Agent | null
  board: StrongRef
  boardRecord?: CreatonForumBoardRecord
  encryptionParams?: ForumAppviewEncryptionParameters
  canPost?: boolean
  onCreated?: () => void
}) {
  const media = useMedia()
  const isDesktop = media.md
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [attachments, setAttachments] = useState<File[]>([])
  const [webVideoFile, setWebVideoFile] = useState<File | null>(null)
  const [nativeVideo, setNativeVideo] = useState<DocumentPickerAsset | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [uploadStatus, setUploadStatus] = useState('')

  const isEncrypted = boardRecord?.postingMode === 'encrypted'
  const videoName = isWeb ? webVideoFile?.name ?? null : nativeVideo?.name ?? null

  const reset = () => {
    setTitle('')
    setBody('')
    setAttachments([])
    setWebVideoFile(null)
    setNativeVideo(null)
    setError('')
    setUploadStatus('')
  }

  const handleAddVideo = async () => {
    if (isWeb) {
      document.getElementById('create-topic-video')?.click()
      return
    }
    try {
      const picked = await pickForumVideo()
      if (picked) setNativeVideo(picked)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to pick video.')
    }
  }

  const handleCreate = async () => {
    if (!agent || !title.trim() || !canPost) return
    setBusy(true)
    setError('')
    setUploadStatus('')
    try {
      if (isEncrypted) {
        const committeeEpoch = isProductionForumCrypto()
          ? encryptionParams?.committeeEpoch
          : 1
        if (!committeeEpoch) {
          throw new Error('Encryption parameters are not available for this board yet.')
        }
        const pdsUrl = resolveProfilePdsUrl({ agent, did: agent.did })
        const videoSource = isWeb ? webVideoFile : nativeVideo
        if (videoSource && !pdsUrl) {
          throw new Error('Could not resolve your PDS URL for video upload.')
        }
        const encryptedVideo = videoSource
          ? await resolveEncryptedBoardVideoInput(
              agent,
              videoSource,
              pdsUrl,
              setUploadStatus,
            )
          : undefined
        await createEncryptedForumTopic(agent, {
          board,
          title: title.trim(),
          body: body.trim(),
          encryption: {
            committeeEpoch,
            policyHash: encryptionParams?.policyHash ?? (await policyHashForBoardAccess(boardRecord?.access)),
            committeePublicKey: encryptionParams?.committeePublicKey,
          },
          attachments: attachments.length ? attachments : undefined,
          logosClient:
            attachments.length > 0 ? createLogosStorageClient(getForumStorageUrl()) : undefined,
          encryptedVideo,
        })
      } else {
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
        await createForumTopic(agent, {
          board,
          title: title.trim(),
          body: body.trim() || undefined,
          video,
        })
      }
      reset()
      onOpenChange(false)
      onCreated?.()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to create topic.')
    } finally {
      setBusy(false)
      setUploadStatus('')
    }
  }

  const gateMessage = !canPost
    ? 'Subscribe to this board before creating encrypted topics.'
    : error || undefined

  const hiddenWebVideoInput = isWeb ? (
    <input
      type="file"
      accept="video/*"
      style={{ display: 'none' }}
      id="create-topic-video"
      onChange={(event) => {
        const file = event.target.files?.[0] ?? null
        setWebVideoFile(file)
        event.target.value = ''
      }}
    />
  ) : null

  const formProps = {
    title,
    setTitle,
    body,
    setBody,
    agent,
    busy,
    canPost,
    gateMessage,
    uploadStatus,
    isEncrypted,
    attachments,
    videoName,
    onPickAttachments: (files: FileList | null) => {
      if (!files) return
      setAttachments((current) => [...current, ...Array.from(files)])
    },
    onRemoveAttachment: (index: number) => {
      setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))
    },
    onAddVideo: () => {
      void handleAddVideo()
    },
    onRemoveVideo: () => {
      setWebVideoFile(null)
      setNativeVideo(null)
    },
    onCreate: handleCreate,
  }

  return (
    <ClientSheet>
      {isDesktop ? (
        <Dialog open={open} onOpenChange={onOpenChange} modal>
          <Dialog.Portal justify="flex-start" pt="$6" px="$4">
            <Dialog.Overlay
              key="overlay"
              opacity={0.5}
              enterStyle={{ opacity: 0 }}
              exitStyle={{ opacity: 0 }}
            />
            <Dialog.Content
              bordered
              elevate
              key="content"
              enterStyle={{ y: -12, opacity: 0 }}
              exitStyle={{ y: -12, opacity: 0 }}
              maxW={420}
              width="100%"
              p="$4"
            >
              <CreateTopicForm {...formProps} />
              {hiddenWebVideoInput}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog>
      ) : (
        <Sheet open={open} onOpenChange={onOpenChange} modal snapPoints={[50]}>
          <Sheet.Overlay />
          <Sheet.Frame p="$4">
            <CreateTopicForm {...formProps} />
            {hiddenWebVideoInput}
          </Sheet.Frame>
        </Sheet>
      )}
    </ClientSheet>
  )
}
