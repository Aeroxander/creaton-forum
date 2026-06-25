import { useState } from 'react'
import type { Agent } from '@atproto/api'
import { createForumTopic, type StrongRef } from '@creaton/forum-core'
import { Dialog, Sheet, SizableText, useMedia, YStack } from 'tamagui'

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
  onCreate,
}: {
  title: string
  setTitle: (value: string) => void
  body: string
  setBody: (value: string) => void
  agent: Agent | null
  busy: boolean
  onCreate: () => void
}) {
  return (
    <YStack gap="$3">
      <SizableText size="$6" fontWeight="700">
        Create a new topic
      </SizableText>

      <Input placeholder="Topic title" value={title} onChangeText={setTitle} />
      <Input
        placeholder="Body (optional)"
        value={body}
        onChangeText={setBody}
        multiline
        height={120}
      />
      <Button theme="blue" disabled={!agent || busy || !title.trim()} onPress={onCreate}>
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
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  agent: Agent | null
  board: StrongRef
  onCreated?: () => void
}) {
  const media = useMedia()
  const isDesktop = media.md
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  const reset = () => {
    setTitle('')
    setBody('')
  }

  const handleCreate = async () => {
    if (!agent || !title.trim()) return
    setBusy(true)
    try {
      await createForumTopic(agent, {
        board,
        title: title.trim(),
        body: body.trim() || undefined,
      })
      reset()
      onOpenChange(false)
      onCreated?.()
    } finally {
      setBusy(false)
    }
  }

  const formProps = {
    title,
    setTitle,
    body,
    setBody,
    agent,
    busy,
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
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog>
      ) : (
        <Sheet open={open} onOpenChange={onOpenChange} modal snapPoints={[50]}>
          <Sheet.Overlay />
          <Sheet.Frame p="$4">
            <CreateTopicForm {...formProps} />
          </Sheet.Frame>
        </Sheet>
      )}
    </ClientSheet>
  )
}
