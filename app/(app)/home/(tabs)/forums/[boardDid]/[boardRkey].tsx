import { BoardRoutePage } from '~/features/forums/ForumBoardPage'
import { createRoute } from 'one'

const route = createRoute<'/(app)/home/(tabs)/forums/[boardDid]/[boardRkey]'>()

export function BoardPage() {
  return <BoardRoutePage />
}
