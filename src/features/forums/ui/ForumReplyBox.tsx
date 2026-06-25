import { useState } from 'react'
import { SizableText, XStack, YStack } from 'tamagui'
import type { Agent } from '@atproto/api'
import {
  createForumComment,
  type CreatonForumCommentRecord,
  type ForumRecord,
  type StrongRef,
} from '@creaton/forum-core'

import { useQueryIdentity, useQueryProfile } from '~/features/profile/profileQueries'
import { profileDisplayName } from '~/features/profile/profileUtils'
import { Button } from '~/interface/buttons/Button'
import { Input } from '~/interface/forms/Input'

export function ForumReplyBox({
  agent,
  topic,
  parent,
  replyTargetAuthorDid,
  onCancelReply,
  onReplied,
}: {
  agent: Agent | null
  topic: StrongRef
  parent?: StrongRef
  replyTargetAuthorDid?: string
  onCancelReply?: () => void
  onReplied?: (comment: ForumRecord<CreatonForumCommentRecord>) => void
}) {
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const profile = useQueryProfile(replyTargetAuthorDid, agent)
  const identity = useQueryIdentity(replyTargetAuthorDid, agent)

  const replyTargetName =
    replyTargetAuthorDid &&
    profileDisplayName({
      profile: profile.data?.value,
      identity: identity.data,
      did: replyTargetAuthorDid,
    })

  const handleReply = async () => {
    if (!agent || !reply.trim()) return
    setBusy(true)
    try {
      const comment = await createForumComment(agent, {
        topic,
        parent,
        body: reply.trim(),
      })
      setReply('')
      onReplied?.(comment)
    } finally {
      setBusy(false)
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
      <Input
        placeholder={agent ? 'Write a reply' : 'Sign in to reply'}
        value={reply}
        onChangeText={setReply}
        multiline
        readOnly={!agent || busy}
      />
      <Button theme="blue" disabled={!agent || busy || !reply.trim()} onPress={handleReply}>
        Post reply
      </Button>
    </YStack>
  )
}
