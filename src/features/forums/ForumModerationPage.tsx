import { useQuery } from '@tanstack/react-query'
import { Link, useLocalSearchParams, type Href } from 'one'
import { Spinner, YStack } from 'tamagui'
import { getForumBoard } from '@creaton/forum-core'

import { ForumEmpty, ForumPage, ForumPanel, ForumSectionHeader } from '~/features/forums/ui/ForumChrome'
import { ModerationDashboard } from '~/features/forums/ui/ModerationDashboard'
import { useForumConfig } from '~/features/forums/useForumQueries'
import { Button } from '~/interface/buttons/Button'
import { PageContainer } from '~/interface/layout/PageContainer'
import { useAuth } from '~/providers/UnifiedAuthProvider'

export function ForumModerationPage() {
  const params = useLocalSearchParams<{ boardDid: string; boardRkey: string }>()
  const { status } = useAuth()
  const { slingshoturl } = useForumConfig()

  const board = useQuery({
    queryKey: ['forum-board', params.boardDid, params.boardRkey, slingshoturl],
    queryFn: () =>
      getForumBoard({
        did: params.boardDid!,
        rkey: params.boardRkey!,
        slingshoturl,
      }),
    enabled: !!params.boardDid && !!params.boardRkey,
  })

  if (board.isLoading) {
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

  const boardHref =
    `/home/forums/${params.boardDid}/${params.boardRkey}` as Href

  return (
    <PageContainer>
      <ForumPage
        title="Moderator dashboard"
        action={
          <Link href={boardHref}>
            <Button size="$3" variant="outlined">
              Back to board
            </Button>
          </Link>
        }
      >
        {status !== 'signedIn' ? (
          <ForumPanel>
            <ForumEmpty message="Sign in to access moderation tools." />
          </ForumPanel>
        ) : (
          <ForumPanel>
            <ForumSectionHeader title={board.data.value.title} />
            <YStack p="$4">
              <ModerationDashboard board={board.data} />
            </YStack>
          </ForumPanel>
        )}
      </ForumPage>
    </PageContainer>
  )
}

export function ModerationRoutePage() {
  return <ForumModerationPage />
}
