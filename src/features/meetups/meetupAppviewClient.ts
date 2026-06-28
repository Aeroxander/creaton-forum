import { resolveForumAppviewUrl } from '@creaton/forum-core'

import type { MeetupRsvpStatus } from '~/features/meetups/meetupTypes'

export type UpcomingMeetupEvent = {
  uri: string
  name: string
  startsAt: string
  endsAt?: string
  boardUri?: string
  boardTitle?: string
  authorDid: string
  mode?: string
  status?: string
  goingCount?: number
  interestedCount?: number
  viewerRsvp?: MeetupRsvpStatus
}

function serviceUrl(host: string, path: string) {
  const base =
    host.startsWith('http://') || host.startsWith('https://')
      ? host.replace(/\/+$/g, '')
      : `https://${host}`
  return `${base}${path}`
}

export async function fetchUpcomingEventsFromAppview({
  forumAppviewUrl,
  viewerDid,
  boardUri,
  boardUris,
  limit = 10,
}: {
  forumAppviewUrl?: string
  viewerDid?: string
  boardUri?: string
  boardUris?: string[]
  limit?: number
}): Promise<UpcomingMeetupEvent[]> {
  const baseUrl = await resolveForumAppviewUrl(forumAppviewUrl)
  const params = new URLSearchParams()
  if (viewerDid) params.set('viewerDid', viewerDid)
  if (boardUri) params.set('boardUri', boardUri)
  if (boardUris && boardUris.length > 0) {
    params.set('boardUris', boardUris.join(','))
  }
  params.set('limit', String(limit))

  const response = await fetch(
    serviceUrl(baseUrl, `/xrpc/app.creaton.forum.getUpcomingEvents?${params.toString()}`),
  )
  if (!response.ok) return []
  const data = (await response.json().catch(() => null)) as {
    events?: UpcomingMeetupEvent[]
  } | null
  return data?.events ?? []
}
