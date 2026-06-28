import { EventRoutePage } from '~/features/forums/ForumEventPage'
import { createRoute } from 'one'

const route =
  createRoute<'/(app)/home/(tabs)/forums/[boardDid]/[boardRkey]/event/[eventDid]/[eventRkey]'>()

export function EventPage() {
  return <EventRoutePage />
}
