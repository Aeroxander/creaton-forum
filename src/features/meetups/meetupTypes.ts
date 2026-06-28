import type { StrongRef } from '@creaton/forum-core'

export const CALENDAR_EVENT_COLLECTION = 'community.lexicon.calendar.event'
export const CALENDAR_RSVP_COLLECTION = 'community.lexicon.calendar.rsvp'
export const CREATON_BOARD_SOURCE = 'app.creaton'

export const EVENT_MODE = {
  inperson: 'community.lexicon.calendar.event#inperson',
  virtual: 'community.lexicon.calendar.event#virtual',
  hybrid: 'community.lexicon.calendar.event#hybrid',
} as const

export const EVENT_STATUS = {
  planned: 'community.lexicon.calendar.event#planned',
  scheduled: 'community.lexicon.calendar.event#scheduled',
  cancelled: 'community.lexicon.calendar.event#cancelled',
  postponed: 'community.lexicon.calendar.event#postponed',
  rescheduled: 'community.lexicon.calendar.event#rescheduled',
} as const

export const RSVP_STATUS = {
  going: 'community.lexicon.calendar.rsvp#going',
  interested: 'community.lexicon.calendar.rsvp#interested',
  notgoing: 'community.lexicon.calendar.rsvp#notgoing',
} as const

export type MeetupRsvpStatus = 'going' | 'interested' | 'notgoing'
export type MeetupEventMode = keyof typeof EVENT_MODE

export type CalendarEventUriRef = {
  $type?: 'community.lexicon.calendar.event#uri'
  uri: string
  name?: string
  source?: string
}

export type CalendarEventLocation =
  | CalendarEventUriRef
  | {
      $type: 'community.lexicon.location.geo'
      latitude: string
      longitude: string
      name?: string
      source?: string
    }

export type CalendarEventRecord = {
  $type: typeof CALENDAR_EVENT_COLLECTION
  name: string
  description?: string
  createdAt: string
  startsAt?: string
  endsAt?: string
  mode?: string
  status?: string
  locations?: CalendarEventLocation[]
  uris?: CalendarEventUriRef[]
}

export type CalendarRsvpRecord = {
  $type: typeof CALENDAR_RSVP_COLLECTION
  subject: StrongRef
  status: string
  createdAt?: string
}

export function rsvpStatusToShort(status: string): MeetupRsvpStatus | undefined {
  if (status.includes('#')) {
    const short = status.split('#').pop()
    if (short === 'going' || short === 'interested' || short === 'notgoing') {
      return short
    }
  }
  if (status === 'going' || status === 'interested' || status === 'notgoing') {
    return status
  }
  return undefined
}

export function extractBoardUriFromEvent(record: CalendarEventRecord): string | undefined {
  for (const entry of record.uris ?? []) {
    if (entry.uri.includes('/app.creaton.forum.board/')) {
      return entry.uri
    }
  }
  return undefined
}
