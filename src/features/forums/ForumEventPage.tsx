import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocalSearchParams, type Href } from 'one'
import { useState } from 'react'
import { Spinner, SizableText, YStack } from 'tamagui'
import { getForumBoard } from '@creaton/forum-core'

import {
  ForumEmpty,
  ForumPage,
  ForumPanel,
} from '~/features/forums/ui/ForumChrome'
import { useForumConfig } from '~/features/forums/useForumQueries'
import { fetchUpcomingEventsFromAppview } from '~/features/meetups/meetupAppviewClient'
import {
  formatMeetupDateRange,
  formatMeetupMode,
  summarizeMeetupLocation,
} from '~/features/meetups/meetupFormat'
import {
  clearEventRsvp,
  getCalendarEvent,
  getViewerRsvpForEvent,
  updateEventRsvp,
} from '~/features/meetups/meetupRepository'
import type { MeetupRsvpStatus } from '~/features/meetups/meetupTypes'
import { extractBoardUriFromEvent } from '~/features/meetups/meetupTypes'
import { Button } from '~/interface/buttons/Button'
import { PageContainer } from '~/interface/layout/PageContainer'
import { useAuth } from '~/providers/UnifiedAuthProvider'

export function ForumEventPage() {
  const params = useLocalSearchParams<{
    boardDid: string
    boardRkey: string
    eventDid: string
    eventRkey: string
  }>()
  const { agent, status } = useAuth()
  const { slingshoturl, forumAppviewUrl } = useForumConfig()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')

  const board = useQuery({
    queryKey: ['forum-board', params.boardDid, params.boardRkey, slingshoturl],
    queryFn: () =>
      getForumBoard({
        did: params.boardDid!,
        rkey: params.boardRkey!,
        slingshoturl,
      }),
    staleTime: 60 * 1000,
  })

  const event = useQuery({
    queryKey: ['forum-event', params.eventDid, params.eventRkey, slingshoturl],
    queryFn: () =>
      getCalendarEvent({
        did: params.eventDid!,
        rkey: params.eventRkey!,
        slingshoturl,
      }),
    staleTime: 60 * 1000,
  })

  const viewerRsvp = useQuery({
    queryKey: ['forum-event-rsvp', event.data?.uri, agent?.did],
    queryFn: () =>
      agent && event.data
        ? getViewerRsvpForEvent(agent, event.data.uri)
        : Promise.resolve(undefined),
    enabled: status === 'signedIn' && !!agent && !!event.data,
    staleTime: 15 * 1000,
  })

  const eventStats = useQuery({
    queryKey: ['forum-event-stats', event.data?.uri, agent?.did, forumAppviewUrl],
    queryFn: async () => {
      if (!event.data) return null
      const boardUri = extractBoardUriFromEvent(event.data.value) ?? board.data?.uri
      const events = await fetchUpcomingEventsFromAppview({
        forumAppviewUrl,
        viewerDid: agent?.did,
        boardUri,
        limit: 50,
      })
      return events.find((item) => item.uri === event.data?.uri) ?? null
    },
    enabled: !!event.data,
    staleTime: 30 * 1000,
  })

  const rsvpMutation = useMutation({
    mutationFn: async (next: MeetupRsvpStatus | 'clear') => {
      if (!agent || !event.data) throw new Error('Sign in to RSVP.')
      if (next === 'clear') {
        await clearEventRsvp(agent, event.data.uri)
        return
      }
      await updateEventRsvp(agent, {
        event: { uri: event.data.uri, cid: event.data.cid },
        status: next,
      })
    },
    onSuccess: () => {
      setError('')
      void queryClient.invalidateQueries({ queryKey: ['forum-event-rsvp'] })
      void queryClient.invalidateQueries({ queryKey: ['forum-event-stats'] })
      void queryClient.invalidateQueries({ queryKey: ['forum-upcoming-events'] })
    },
    onError: (cause) => {
      setError(cause instanceof Error ? cause.message : 'Failed to update RSVP.')
    },
  })

  const boardHref = `/home/forums/${params.boardDid}/${params.boardRkey}` as Href
  const eventsHref =
    `/home/forums/${params.boardDid}/${params.boardRkey}/events` as Href

  if (event.isError || board.isError) {
    return (
      <PageContainer>
        <ForumEmpty message="Event not found." />
      </PageContainer>
    )
  }

  if (event.isLoading || board.isLoading) {
    return (
      <PageContainer>
        <Spinner size="large" />
      </PageContainer>
    )
  }

  const eventRecord = event.data?.value
  const boardTitle = board.data?.value.title ?? 'Forum'
  const locationLabel = eventRecord ? summarizeMeetupLocation(eventRecord) : undefined
  const currentRsvp = viewerRsvp.data ?? eventStats.data?.viewerRsvp

  return (
    <PageContainer>
      <ForumPage
        title={eventRecord?.name ?? 'Event'}
        action={
          <YStack gap="$2" items="flex-end">
            <Link href={eventsHref}>
              <Button size="$3" variant="outlined">
                All events
              </Button>
            </Link>
            <Link href={boardHref}>
              <Button size="$3" variant="outlined">
                {boardTitle}
              </Button>
            </Link>
          </YStack>
        }
      >
        <ForumPanel>
          {eventRecord ? (
            <YStack p="$4" gap="$3">
              <SizableText size="$8" fontWeight="700">
                {eventRecord.name}
              </SizableText>
              <SizableText size="$4" opacity={0.7}>
                {formatMeetupDateRange(eventRecord.startsAt, eventRecord.endsAt)}
              </SizableText>
              <SizableText size="$4" opacity={0.7}>
                {formatMeetupMode(eventRecord.mode)}
                {locationLabel ? ` · ${locationLabel}` : ''}
              </SizableText>
              {eventRecord.description ? (
                <SizableText size="$4" whiteSpace="pre-wrap">
                  {eventRecord.description}
                </SizableText>
              ) : null}

              {eventStats.data?.goingCount !== undefined ||
              eventStats.data?.interestedCount !== undefined ? (
                <SizableText size="$3" opacity={0.7}>
                  {eventStats.data?.goingCount ?? 0} going ·{' '}
                  {eventStats.data?.interestedCount ?? 0} interested
                </SizableText>
              ) : null}

              {status === 'signedIn' ? (
                <XStackWrap>
                  <Button
                    theme={currentRsvp === 'going' ? 'blue' : undefined}
                    disabled={rsvpMutation.isPending}
                    onPress={() => rsvpMutation.mutate('going')}
                  >
                    Going
                  </Button>
                  <Button
                    variant="outlined"
                    disabled={rsvpMutation.isPending}
                    onPress={() => rsvpMutation.mutate('interested')}
                  >
                    Interested
                  </Button>
                  {currentRsvp ? (
                    <Button
                      variant="outlined"
                      disabled={rsvpMutation.isPending}
                      onPress={() => rsvpMutation.mutate('clear')}
                    >
                      Clear RSVP
                    </Button>
                  ) : null}
                </XStackWrap>
              ) : (
                <SizableText size="$4" opacity={0.7}>
                  Sign in to RSVP to this event.
                </SizableText>
              )}

              {error ? (
                <SizableText color="$red10" size="$3">
                  {error}
                </SizableText>
              ) : null}
            </YStack>
          ) : (
            <ForumEmpty message="Event not found." />
          )}
        </ForumPanel>
      </ForumPage>
    </PageContainer>
  )
}

function XStackWrap({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{children}</div>
  )
}

export function EventRoutePage() {
  return <ForumEventPage />
}
