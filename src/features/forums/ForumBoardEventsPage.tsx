import { useQuery } from '@tanstack/react-query'
import { Link, useLocalSearchParams, type Href } from 'one'
import { useMemo } from 'react'
import { Spinner, SizableText, YStack } from 'tamagui'
import { getForumBoard, parseAtUri } from '@creaton/forum-core'

import {
  ForumEmpty,
  ForumPage,
  ForumPanel,
  ForumSectionHeader,
} from '~/features/forums/ui/ForumChrome'
import { useForumConfig } from '~/features/forums/useForumQueries'
import { fetchUpcomingEventsFromAppview } from '~/features/meetups/meetupAppviewClient'
import { formatMeetupRelativeDate } from '~/features/meetups/meetupFormat'
import { listBoardEvents } from '~/features/meetups/meetupRepository'
import { ScheduleMeetupButton } from '~/features/meetups/ui/ScheduleMeetupSheet'
import { Button } from '~/interface/buttons/Button'
import { PageContainer } from '~/interface/layout/PageContainer'
import { useAuth } from '~/providers/UnifiedAuthProvider'

export function ForumBoardEventsPage() {
  const params = useLocalSearchParams<{ boardDid: string; boardRkey: string }>()
  const { agent } = useAuth()
  const { constellation, slingshoturl, forumAppviewUrl } = useForumConfig()

  const boardUri = `at://${params.boardDid}/app.creaton.forum.board/${params.boardRkey}`

  const board = useQuery({
    queryKey: ['forum-board', boardUri, slingshoturl],
    queryFn: () =>
      getForumBoard({
        did: params.boardDid!,
        rkey: params.boardRkey!,
        slingshoturl,
      }),
    enabled: !!params.boardDid && !!params.boardRkey,
  })

  const boardRef = board.data
    ? { uri: board.data.uri, cid: board.data.cid }
    : { uri: boardUri, cid: '' }

  const appviewEvents = useQuery({
    queryKey: ['forum-upcoming-events', boardUri, agent?.did, forumAppviewUrl],
    queryFn: () =>
      fetchUpcomingEventsFromAppview({
        forumAppviewUrl,
        viewerDid: agent?.did,
        boardUri,
        limit: 20,
      }),
    staleTime: 60 * 1000,
  })

  const fallbackEvents = useQuery({
    queryKey: ['forum-board-events', boardRef.uri, constellation, slingshoturl],
    queryFn: () =>
      listBoardEvents({
        board: boardRef,
        constellation,
        slingshoturl,
      }),
    enabled:
      (appviewEvents.data?.length ?? 0) === 0 &&
      !appviewEvents.isLoading &&
      !!board.data &&
      !!constellation,
    staleTime: 60 * 1000,
  })

  const events = useMemo(() => {
    if (appviewEvents.data && appviewEvents.data.length > 0) {
      return appviewEvents.data.map((event) => ({
        uri: event.uri,
        name: event.name,
        startsAt: event.startsAt,
        goingCount: event.goingCount,
      }))
    }
    return (fallbackEvents.data ?? []).map((event) => ({
      uri: event.uri,
      name: event.value.name,
      startsAt: event.value.startsAt ?? '',
      goingCount: undefined as number | undefined,
    }))
  }, [appviewEvents.data, fallbackEvents.data])

  const boardHref = `/home/forums/${params.boardDid}/${params.boardRkey}` as Href
  const isLoading =
    board.isLoading ||
    (appviewEvents.isLoading && fallbackEvents.isLoading)

  if (isLoading && !board.data) {
    return (
      <PageContainer>
        <Spinner size="large" />
      </PageContainer>
    )
  }

  if (!board.data) {
    return (
      <PageContainer>
        <ForumEmpty message="Board not found." />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <ForumPage
        title="Board events"
        action={
          <YStack gap="$2" items="flex-end">
            <ScheduleMeetupButton
              boardDid={params.boardDid!}
              boardRkey={params.boardRkey!}
              agent={agent}
            />
            <Link href={boardHref}>
              <Button size="$3" variant="outlined">
                Back to board
              </Button>
            </Link>
          </YStack>
        }
      >
        <ForumPanel>
          <ForumSectionHeader title={board.data.value.title} />
          {isLoading ? (
            <Spinner m="$4" />
          ) : events.length === 0 ? (
            <ForumEmpty message="No upcoming events on this board." />
          ) : (
            events.map((event) => {
              const parsed = parseAtUri(event.uri)
              if (!parsed) return null
              const href =
                `/home/forums/${params.boardDid}/${params.boardRkey}/event/${parsed.did}/${parsed.rkey}` as Href
              return (
                <Link key={event.uri} href={href}>
                  <YStack
                    px="$4"
                    py="$3"
                    gap="$1"
                    borderBottomWidth={1}
                    borderColor="$color5"
                    hoverStyle={{ bg: '$color3' }}
                    pressStyle={{ bg: '$color4' }}
                    cursor="pointer"
                  >
                    <SizableText size="$5" fontWeight="600">
                      {event.name}
                    </SizableText>
                    <SizableText size="$3" opacity={0.7}>
                      {formatMeetupRelativeDate(event.startsAt)}
                      {event.goingCount !== undefined && event.goingCount > 0
                        ? ` · ${event.goingCount} going`
                        : ''}
                    </SizableText>
                  </YStack>
                </Link>
              )
            })
          )}
        </ForumPanel>
      </ForumPage>
    </PageContainer>
  )
}

export function BoardEventsRoutePage() {
  return <ForumBoardEventsPage />
}
