import { useRouter } from 'one'
import { H1, SizableText, YStack } from 'tamagui'

import { EditProfileForm } from '~/features/profile/EditProfileForm'
import { Button } from '~/interface/buttons/Button'
import { PageContainer } from '~/interface/layout/PageContainer'
import { PageLayout } from '~/interface/pages/PageLayout'
import { useAuth } from '~/providers/UnifiedAuthProvider'

export default function EditProfilePage() {
  const router = useRouter()
  const { agent, status } = useAuth()

  if (status === 'loading') {
    return (
      <PageLayout>
        <PageContainer py="$4">
          <SizableText color="$color10">Loading…</SizableText>
        </PageContainer>
      </PageLayout>
    )
  }

  if (!agent) {
    return (
      <PageLayout>
        <PageContainer py="$4" gap="$4" items="center">
          <SizableText color="$color10" text="center">
            Sign in to edit your profile.
          </SizableText>
          <Button size="$5" onPress={() => router.back()}>
            Go Back
          </Button>
        </PageContainer>
      </PageLayout>
    )
  }

  return (
    <PageLayout>
      <PageContainer py="$4" gap="$4">
        <H1 size="$7" color="$color12">
          Edit profile
        </H1>
        <EditProfileForm agent={agent} />
      </PageContainer>
    </PageLayout>
  )
}
