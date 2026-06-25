import { TopicRoutePage } from '~/features/forums/ForumTopicPage'
import { createRoute } from 'one'

const route = createRoute<'/(app)/home/(tabs)/forums/[boardDid]/[boardRkey]/topic/[topicDid]/[topicRkey]'>()

export function TopicPage() {
  return <TopicRoutePage />
}
