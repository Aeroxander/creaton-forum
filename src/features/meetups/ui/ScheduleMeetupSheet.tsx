import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { Agent } from '@atproto/api'
import { Dialog, Sheet, SizableText, useMedia, XStack, YStack } from 'tamagui'
import { getForumBoard, isForumBoardMember, type StrongRef } from '@creaton/forum-core'

import { createBoardEvent } from '~/features/meetups/meetupRepository'
import type { MeetupEventMode } from '~/features/meetups/meetupTypes'
import { Button } from '~/interface/buttons/Button'
import { Input } from '~/interface/forms/Input'
import { useAuth } from '~/providers/UnifiedAuthProvider'
import { useForumConfig } from '~/features/forums/useForumQueries'

import { ClientSheet } from '~/features/forums/ui/ClientSheet'

const MODE_OPTIONS: Array<{ value: MeetupEventMode; label: string }> = [
  { value: 'inperson', label: 'In person' },
  { value: 'virtual', label: 'Online' },
  { value: 'hybrid', label: 'Hybrid' },
]

function ScheduleMeetupForm({
  board,
  boardTitle,
  onClose,
}: {
  board: StrongRef
  boardTitle: string
  onClose: () => void
}) {
  const { agent } = useAuth()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [mode, setMode] = useState<MeetupEventMode>('inperson')
  const [location, setLocation] = useState('')
  const [onlineUrl, setOnlineUrl] = useState('')
  const [error, setError] = useState('')

  const createEvent = useMutation({
    mutationFn: () => {
      if (!agent) throw new Error('Sign in before creating an event.')
      if (!name.trim()) throw new Error('Event name is required.')
      if (!startsAt) throw new Error('Start time is required.')
      return createBoardEvent(agent, {
        board,
        name,
        description,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
        mode,
        locationName: location,
        onlineUrl,
      })
    },
    onSuccess: () => {
      setName('')
      setDescription('')
      setStartsAt('')
      setEndsAt('')
      setMode('inperson')
      setLocation('')
      setOnlineUrl('')
      setError('')
      onClose()
      void queryClient.invalidateQueries({ queryKey: ['forum-upcoming-events'] })
      void queryClient.invalidateQueries({ queryKey: ['forum-board-events'] })
    },
    onError: (cause) => {
      setError(cause instanceof Error ? cause.message : 'Failed to create event.')
    },
  })

  return (
    <YStack gap="$3">
      <SizableText size="$6" fontWeight="700">
        Schedule event
      </SizableText>
      <SizableText size="$3" opacity={0.7}>
        {boardTitle}
      </SizableText>
      <Input value={name} onChangeText={setName} placeholder="Event name" />
      <Input
        value={description}
        onChangeText={setDescription}
        placeholder="Description (optional)"
        multiline
        numberOfLines={4}
      />
      <XStack gap="$3" flexWrap="wrap">
        <YStack flex={1} gap="$1" minW={200}>
          <SizableText size="$2" opacity={0.7}>
            Starts
          </SizableText>
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
            style={{ padding: 8, borderRadius: 8, width: '100%' }}
          />
        </YStack>
        <YStack flex={1} gap="$1" minW={200}>
          <SizableText size="$2" opacity={0.7}>
            Ends (optional)
          </SizableText>
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
            style={{ padding: 8, borderRadius: 8, width: '100%' }}
          />
        </YStack>
      </XStack>
      <XStack gap="$2" flexWrap="wrap">
        {MODE_OPTIONS.map((option) => (
          <Button
            key={option.value}
            size="$3"
            theme={mode === option.value ? 'blue' : undefined}
            variant={mode === option.value ? undefined : 'outlined'}
            onPress={() => setMode(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </XStack>
      <Input
        value={location}
        onChangeText={setLocation}
        placeholder="Location name (optional)"
      />
      <Input
        value={onlineUrl}
        onChangeText={setOnlineUrl}
        placeholder="Online meeting URL (optional)"
      />
      {error ? (
        <SizableText color="$red10" size="$3">
          {error}
        </SizableText>
      ) : null}
      <XStack justify="flex-end" gap="$2">
        <Button variant="outlined" onPress={onClose}>
          Cancel
        </Button>
        <Button theme="blue" disabled={createEvent.isPending} onPress={() => createEvent.mutate()}>
          {createEvent.isPending ? 'Creating…' : 'Create event'}
        </Button>
      </XStack>
    </YStack>
  )
}

export function ScheduleMeetupSheet({
  open,
  onOpenChange,
  board,
  boardTitle,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  board: StrongRef
  boardTitle: string
}) {
  const media = useMedia()

  if (media.sm) {
    return (
      <ClientSheet>
        <Sheet modal open={open} onOpenChange={onOpenChange} snapPoints={[90]} dismissOnSnapToBottom>
          <Sheet.Overlay />
          <Sheet.Frame p="$4">
            <Sheet.Handle />
            <ScheduleMeetupForm
              board={board}
              boardTitle={boardTitle}
              onClose={() => onOpenChange(false)}
            />
          </Sheet.Frame>
        </Sheet>
      </ClientSheet>
    )
  }

  return (
    <ClientSheet>
      <Dialog modal open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay />
          <Dialog.Content maxW={520} p="$4" rounded="$4">
            <ScheduleMeetupForm
              board={board}
              boardTitle={boardTitle}
              onClose={() => onOpenChange(false)}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    </ClientSheet>
  )
}

export function ScheduleMeetupButton({
  boardDid,
  boardRkey,
  agent,
}: {
  boardDid: string
  boardRkey: string
  agent: Agent | null
}) {
  const { status } = useAuth()
  const { slingshoturl } = useForumConfig()
  const [open, setOpen] = useState(false)

  const board = useQuery({
    queryKey: ['forum-board', boardDid, boardRkey, slingshoturl],
    queryFn: () => getForumBoard({ did: boardDid, rkey: boardRkey, slingshoturl }),
    enabled: open,
  })

  const membership = useQuery({
    queryKey: ['forum-board-member', board.data?.uri, agent?.did],
    queryFn: () =>
      agent && board.data
        ? isForumBoardMember(agent, { uri: board.data.uri, cid: board.data.cid })
        : Promise.resolve(false),
    enabled: status === 'signedIn' && !!agent && !!board.data,
  })

  if (status !== 'signedIn' || !agent || !membership.data || !board.data) {
    return null
  }

  return (
    <>
      <Button size="$3" theme="blue" onPress={() => setOpen(true)}>
        Schedule event
      </Button>
      <ScheduleMeetupSheet
        open={open}
        onOpenChange={setOpen}
        board={{ uri: board.data.uri, cid: board.data.cid }}
        boardTitle={board.data.value.title}
      />
    </>
  )
}
