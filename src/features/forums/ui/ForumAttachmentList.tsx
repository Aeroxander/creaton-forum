import { useQuery } from '@tanstack/react-query'
import { Image, SizableText, XStack, YStack } from 'tamagui'

import {
  decryptForumAttachment,
  createLogosStorageClient,
  type CreatonForumAccessPolicy,
  type CreatonForumEncryptedAttachment,
  type CreatonForumEncryptedContentV3,
} from '@creaton/forum-core'

import { getForumStorageUrl } from '~/features/forums/crypto/forumCryptoMode'
import { useForumUnlock } from '~/features/forums/useForumUnlock'

export function ForumAttachmentList({
  attachments,
  boardUri,
  recordUri,
  recordType,
  protectedBody,
  access,
}: {
  attachments: CreatonForumEncryptedAttachment[]
  boardUri: string
  recordUri: string
  recordType: 'topic' | 'comment'
  protectedBody?: CreatonForumEncryptedContentV3
  access?: CreatonForumAccessPolicy
}) {
  if (!attachments.length) return null

  return (
    <YStack gap="$2" mt="$2">
      {attachments.map((attachment, index) => (
        <ForumAttachmentItem
          key={`${attachment.manifestUri}-${index}`}
          attachment={attachment}
          boardUri={boardUri}
          recordUri={recordUri}
          recordType={recordType}
          protectedBody={protectedBody}
          access={access}
        />
      ))}
    </YStack>
  )
}

function ForumAttachmentItem({
  attachment,
  boardUri,
  recordUri,
  recordType,
  protectedBody,
  access,
}: {
  attachment: CreatonForumEncryptedAttachment
  boardUri: string
  recordUri: string
  recordType: 'topic' | 'comment'
  protectedBody?: CreatonForumEncryptedContentV3
  access?: CreatonForumAccessPolicy
}) {
  const { getEpochKey } = useForumUnlock(boardUri)
  const logosClient = createLogosStorageClient(getForumStorageUrl())

  const decrypted = useQuery({
    queryKey: ['forum-attachment', attachment.manifestUri, recordUri, boardUri],
    queryFn: async () => {
      if (!protectedBody || !access) {
        throw new Error('Subscribe to unlock attachments on this board.')
      }
      const epochKey = await getEpochKey({
        boardUri,
        recordUri,
        recordType,
        protectedBody,
        access,
      })
      return decryptForumAttachment({
        attachment,
        boardEpochKey: epochKey,
        logosClient,
      })
    },
    enabled: !!protectedBody && !!access,
    staleTime: 5 * 60 * 1000,
  })

  if (decrypted.isLoading) {
    return (
      <SizableText size="$2" opacity={0.6}>
        Unlocking attachment…
      </SizableText>
    )
  }

  if (decrypted.isError || !decrypted.data) {
    return (
      <SizableText size="$2" opacity={0.6}>
        Encrypted attachment — unlock post to view
      </SizableText>
    )
  }

  const { bytes, mediaType, name } = decrypted.data
  const isImage = mediaType?.startsWith('image/')

  if (isImage) {
    const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: mediaType }))
    return (
      <YStack gap="$1">
        <Image source={{ uri: url, width: 320, height: 200 }} rounded="$3" />
        {name ? (
          <SizableText size="$2" opacity={0.6}>
            {name}
          </SizableText>
        ) : null}
      </YStack>
    )
  }

  const url = URL.createObjectURL(
    new Blob([Uint8Array.from(bytes)], { type: mediaType || 'application/octet-stream' }),
  )
  return (
    <XStack gap="$2" items="center">
      <SizableText
        size="$3"
        color="$blue10"
        cursor="pointer"
        onPress={() => {
          if (typeof window !== 'undefined') window.open(url, '_blank')
        }}
      >
        {name ?? 'Download attachment'}
      </SizableText>
    </XStack>
  )
}
