import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Agent } from '@atproto/api'
import { createForumBoard } from '@creaton/forum-core'
import { Dialog, Sheet, SizableText, useMedia, XStack, YStack } from 'tamagui'

import { Button } from '~/interface/buttons/Button'
import { Input } from '~/interface/forms/Input'

import { ClientSheet } from './ClientSheet'

type PostingMode = 'public' | 'mixed' | 'encrypted'

const POSTING_MODES: Array<{ value: PostingMode; label: string }> = [
  { value: 'public', label: 'Public board' },
  { value: 'mixed', label: 'Public + member-only' },
  { value: 'encrypted', label: 'Member-only (encrypted)' },
]

function CreateBoardForm({
  title,
  setTitle,
  description,
  setDescription,
  postingMode,
  setPostingMode,
  error,
  agent,
  busy,
  onCreate,
}: {
  title: string
  setTitle: (value: string) => void
  description: string
  setDescription: (value: string) => void
  postingMode: PostingMode
  setPostingMode: (value: PostingMode) => void
  error: string
  agent: Agent | null
  busy: boolean
  onCreate: () => void
}) {
  return (
    <YStack gap="$3">
      <SizableText size="$6" fontWeight="700">
        Create a new board
      </SizableText>

      <Input placeholder="Board title" value={title} onChangeText={setTitle} />

      <Input
        placeholder="Short description (optional)"
        value={description}
        onChangeText={setDescription}
        multiline
        height={80}
      />

      <YStack gap="$1">
        <SizableText size="$3" fontWeight="600" opacity={0.7}>
          Posting mode
        </SizableText>
        <XStack gap="$2" flexWrap="wrap">
          {POSTING_MODES.map((mode) => (
            <Button
              key={mode.value}
              size="$3"
              theme={postingMode === mode.value ? 'blue' : undefined}
              variant={postingMode === mode.value ? undefined : 'outlined'}
              onPress={() => setPostingMode(mode.value)}
            >
              {mode.label}
            </Button>
          ))}
        </XStack>
      </YStack>

      {postingMode !== 'public' ? (
        <SizableText size="$2" opacity={0.6}>
          Member-only and encrypted boards require a paid access policy, which will be
          available in a later phase.
        </SizableText>
      ) : null}

      {error ? (
        <SizableText size="$3" color="$red10">
          {error}
        </SizableText>
      ) : null}

      <Button
        theme="blue"
        disabled={!agent || busy || !title.trim()}
        onPress={onCreate}
      >
        {busy ? 'Creating...' : 'Create board'}
      </Button>
    </YStack>
  )
}

export function CreateBoardSheet({
  open,
  onOpenChange,
  agent,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  agent: Agent | null
  onCreated?: () => void
}) {
  const queryClient = useQueryClient()
  const media = useMedia()
  const isDesktop = media.md
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [postingMode, setPostingMode] = useState<PostingMode>('public')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const reset = () => {
    setTitle('')
    setDescription('')
    setPostingMode('public')
    setError('')
  }

  const handleCreate = async () => {
    if (!agent || !title.trim()) return
    setBusy(true)
    setError('')
    try {
      await createForumBoard(agent, {
        title: title.trim(),
        description: description.trim() || undefined,
        postingMode,
      })
      reset()
      onOpenChange(false)
      onCreated?.()
      void queryClient.invalidateQueries({ queryKey: ['forum-your-boards'] })
      void queryClient.invalidateQueries({ queryKey: ['forum-discover-boards'] })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to create board.')
    } finally {
      setBusy(false)
    }
  }

  const formProps = {
    title,
    setTitle,
    description,
    setDescription,
    postingMode,
    setPostingMode,
    error,
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
              <CreateBoardForm {...formProps} />
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog>
      ) : (
        <Sheet
          open={open}
          onOpenChange={onOpenChange}
          modal
          snapPoints={[60]}
          dismissOnSnapToBottom
        >
          <Sheet.Overlay />
          <Sheet.Frame p="$4">
            <CreateBoardForm {...formProps} />
          </Sheet.Frame>
        </Sheet>
      )}
    </ClientSheet>
  )
}
