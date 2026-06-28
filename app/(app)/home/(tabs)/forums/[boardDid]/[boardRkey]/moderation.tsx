import { ModerationRoutePage } from '~/features/forums/ForumModerationPage'
import { createRoute } from 'one'

const route = createRoute<'/(app)/home/(tabs)/forums/[boardDid]/[boardRkey]/moderation'>()

export function ModerationPage() {
  return <ModerationRoutePage />
}
