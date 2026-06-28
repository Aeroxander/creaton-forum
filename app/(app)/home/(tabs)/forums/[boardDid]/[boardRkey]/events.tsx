import { BoardEventsRoutePage } from '~/features/forums/ForumBoardEventsPage'
import { createRoute } from 'one'

const route = createRoute<'/(app)/home/(tabs)/forums/[boardDid]/[boardRkey]/events'>()

export function EventsPage() {
  return <BoardEventsRoutePage />
}
