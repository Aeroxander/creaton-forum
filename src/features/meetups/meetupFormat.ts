import type { CalendarEventRecord } from '~/features/meetups/meetupTypes'
import { EVENT_MODE } from '~/features/meetups/meetupTypes'

export function formatMeetupDateRange(startsAt?: string, endsAt?: string) {
  if (!startsAt) return 'Date TBD'
  const start = new Date(startsAt)
  const startText = start.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  if (!endsAt) return startText
  const end = new Date(endsAt)
  const sameDay = start.toDateString() === end.toDateString()
  const endText = end.toLocaleString(undefined, {
    weekday: sameDay ? undefined : 'short',
    month: sameDay ? undefined : 'short',
    day: sameDay ? undefined : 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  return `${startText} – ${endText}`
}

export function formatMeetupRelativeDate(startsAt?: string) {
  if (!startsAt) return 'TBD'
  const start = new Date(startsAt)
  const now = new Date()
  const diffMs = start.getTime() - now.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays > 1 && diffDays < 7) return `In ${diffDays} days`
  return start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function formatMeetupMode(mode?: string) {
  if (!mode) return 'In person'
  if (mode === EVENT_MODE.virtual || mode.includes('#virtual')) return 'Online'
  if (mode === EVENT_MODE.hybrid || mode.includes('#hybrid')) return 'Hybrid'
  return 'In person'
}

export function summarizeMeetupLocation(record: CalendarEventRecord) {
  for (const location of record.locations ?? []) {
    if ('name' in location && location.name) return location.name
    if ('uri' in location && location.name) return location.name
    if ('latitude' in location && location.name) return location.name
  }
  for (const uri of record.uris ?? []) {
    if (uri.name === 'Online Meeting Link') return 'Online'
  }
  return undefined
}

export function isEventCancelled(record: CalendarEventRecord) {
  return record.status?.includes('#cancelled') || record.status === 'cancelled'
}

export function isEventUpcoming(record: CalendarEventRecord) {
  if (isEventCancelled(record)) return false
  if (!record.startsAt) return false
  return new Date(record.startsAt).getTime() >= Date.now()
}
