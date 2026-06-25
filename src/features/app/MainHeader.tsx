import { Link, router, type Href } from 'one'
import { memo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { H3, Separator, Sheet, Spacer, View, XStack, YStack } from 'tamagui'

import { useQueryIdentity } from '~/features/profile/profileQueries'
import {
  getProfileAvatarUrl,
  localIdentityForAgent,
  profileDisplayName,
  resolveProfilePdsUrl,
  type ProfileRecord,
} from '~/features/profile/profileUtils'
import { useAuth } from '~/providers/UnifiedAuthProvider'
import { Logo } from '~/interface/app/Logo'
import { Avatar } from '~/interface/avatars/Avatar'
import { Button } from '~/interface/buttons/Button'
import { ScrollHeader } from '~/interface/headers/ScrollHeader'
import { DoorIcon } from '~/interface/icons/phosphor/DoorIcon'
import { GearIcon } from '~/interface/icons/phosphor/GearIcon'
import { ListIcon } from '~/interface/icons/phosphor/ListIcon'
import { PageContainer } from '~/interface/layout/PageContainer'
import { ThemeSwitch } from '~/interface/theme/ThemeSwitch'

import { NavigationTabs } from './NavigationTabs'
import { ClientSheet } from '~/features/forums/ui/ClientSheet'

function useCachedOwnProfile(agent: ReturnType<typeof useAuth>['agent']) {
  const queryClient = useQueryClient()
  const did = agent?.did
  if (!did) return null

  return (
    queryClient.getQueryData<ProfileRecord | null>([
      'profile',
      did,
      import.meta.env.DEV ? agent?.did : undefined,
      'edit',
    ]) ??
    queryClient.getQueryData<ProfileRecord | null>([
      'profile',
      did,
      import.meta.env.DEV ? agent?.did : undefined,
      'display',
    ])
  )
}

function useOwnProfileSummary(agent: ReturnType<typeof useAuth>['agent']) {
  const identity = useQueryIdentity(agent?.did, agent)
  const cachedProfile = useCachedOwnProfile(agent)
  const localIdentity = localIdentityForAgent(agent)
  const did = agent?.did
  const pdsUrl = resolveProfilePdsUrl({
    identityPds: identity.data?.pds ?? localIdentity?.pds,
    agent,
    did,
  })
  const profile = cachedProfile?.value
  const avatarUrl = getProfileAvatarUrl({
    did,
    blob: profile?.avatar,
    pdsUrl,
  })
  const displayName = did
    ? profileDisplayName({
        profile,
        identity: identity.data ?? localIdentity,
        did,
      })
    : 'User'

  return { avatarUrl, displayName }
}

export const MainHeader = () => {
  const { agent, status } = useAuth()
  const { avatarUrl, displayName } = useOwnProfileSummary(agent)

  return (
    <ScrollHeader>
      <PageContainer>
        <YStack width="100%" py="$2.5">
          <XStack position="relative" width="100%" px="$2" items="center">
            <XStack gap="$2" items="center">
              <Link href={'/home/forums' as Href} aria-label="Home">
                <Logo height={20} />
              </Link>
            </XStack>

            <Spacer flex={1} />

            <XStack
              position="absolute"
              inset={0}
              pointerEvents="none"
              items="center"
              justify="center"
            >
              <View pointerEvents="auto">
                <NavigationTabs />
              </View>
            </XStack>

            <XStack gap="$2.5" items="center" display="none" $md={{ display: 'flex' }}>
              {status === 'signedIn' && agent ? (
                <Button circular cursor="pointer">
                  <Avatar
                    disableBorder
                    size={28}
                    image={avatarUrl}
                    name={displayName}
                  />
                </Button>
              ) : null}

              <ThemeSwitch />
              <Button
                circular
                onPress={() => router.push('/home/settings')}
                icon={<GearIcon size={18} />}
                aria-label="Settings"
              />
            </XStack>

            <MainHeaderMenu />
          </XStack>
        </YStack>
      </PageContainer>
    </ScrollHeader>
  )
}

export const MainHeaderMenu = memo(() => {
  const { agent, status, logout } = useAuth()
  const { avatarUrl, displayName } = useOwnProfileSummary(agent)
  const [open, setOpen] = useState(false)

  const handleLogout = () => {
    void logout()
    setOpen(false)
  }

  return (
    <>
      <Button
        variant="transparent"
        circular
        icon={<ListIcon size="$1" />}
        aria-label="Menu"
        onPress={() => setOpen(true)}
        $md={{ display: 'none' }}
      />
      <ClientSheet>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        transition="medium"
        modal
        dismissOnSnapToBottom
        snapPoints={[50]}
      >
        <Sheet.Overlay
          bg="$shadow6"
          transition="quick"
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
        />
        <Sheet.Frame bg="$color2" boxShadow="0 0 10px $shadow4">
          <YStack flex={1} gap="$2">
            <XStack p="$4" pb="$3" justify="space-between" items="center">
              <XStack gap="$3" items="center">
                <Logo height={32} />
              </XStack>
              <ThemeSwitch />
            </XStack>

            <Separator />

            <YStack flex={1} p="$3" gap="$2">
              <XStack
                p="$3"
                rounded="$4"
                gap="$3"
                items="center"
                hoverStyle={{ bg: '$color3' }}
                pressStyle={{ bg: '$color4' }}
                cursor="pointer"
                onPress={() => {
                  setOpen(false)
                  router.push('/home/settings')
                }}
              >
                <GearIcon />
                <H3 size="$3">Settings</H3>
              </XStack>

              {status === 'signedIn' ? (
                <XStack
                  p="$3"
                  rounded="$4"
                  gap="$3"
                  items="center"
                  hoverStyle={{ bg: '$color3' }}
                  pressStyle={{ bg: '$color4' }}
                  cursor="pointer"
                  onPress={handleLogout}
                >
                  <DoorIcon />
                  <H3 size="$3">Logout</H3>
                </XStack>
              ) : null}
            </YStack>

            {status === 'signedIn' && agent ? (
              <XStack p="$4" pt="$2" gap="$3" items="center">
                <Avatar size={40} image={avatarUrl} name={displayName} />
                <YStack flex={1}>
                  <H3 size="$3" fontWeight="600">
                    {displayName}
                  </H3>
                </YStack>
              </XStack>
            ) : null}
          </YStack>
        </Sheet.Frame>
      </Sheet>
      </ClientSheet>
    </>
  )
})
