import { useRouter, type Href } from 'one'
import { SizableText, XStack, YStack } from 'tamagui'
import { useQueryClient } from '@tanstack/react-query'

import {
  getProfileAvatarUrl,
  localIdentityForAgent,
  profileDisplayName,
  profileHandleLabel,
  resolveProfilePdsUrl,
  type ProfileRecord,
} from '~/features/profile/profileUtils'
import { useQueryIdentity } from '~/features/profile/profileQueries'
import { Avatar } from '~/interface/avatars/Avatar'
import { CaretRightIcon } from '~/interface/icons/phosphor/CaretRightIcon'
import { Pressable } from '~/interface/buttons/Pressable'
import { useAuth } from '~/providers/UnifiedAuthProvider'

export function ProfileSummary() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { agent, status } = useAuth()
  const did = agent?.did
  const identityQuery = useQueryIdentity(did, agent)
  const cachedProfile = did
    ? queryClient.getQueryData<ProfileRecord | null>(['profile', did, import.meta.env.DEV ? agent?.did : undefined, 'edit'])
      ?? queryClient.getQueryData<ProfileRecord | null>(['profile', did, import.meta.env.DEV ? agent?.did : undefined, 'display'])
    : null

  if (status !== 'signedIn' || !did) {
    return (
      <YStack px="$4" py="$3" gap="$1">
        <SizableText size="$5" fontWeight="700" color="$color12">
          Profile
        </SizableText>
        <SizableText size="$3" color="$color10">
          Sign in to view and edit your profile.
        </SizableText>
      </YStack>
    )
  }

  const profile = cachedProfile?.value
  const identity = identityQuery.data ?? localIdentityForAgent(agent)
  const pdsUrl = resolveProfilePdsUrl({
    identityPds: identity?.pds,
    agent,
    did,
  })
  const avatarUrl = getProfileAvatarUrl({
    did,
    blob: profile?.avatar,
    pdsUrl,
  })
  const name = profileDisplayName({ profile, identity, did })
  const handle = profileHandleLabel({ identity, did })
  const hasProfile = !!profile

  return (
    <Pressable
      onPress={() => router.push('/home/settings/edit-profile' as Href)}
    >
      <XStack
        px="$4"
        py="$4"
        gap="$3"
        items="center"
        cursor="pointer"
        hoverStyle={{ bg: '$color2' }}
      >
        <Avatar image={avatarUrl} name={name} size="lg" />
        <YStack flex={1} gap="$1">
          <SizableText size="$5" fontWeight="700" color="$color12">
            {name}
          </SizableText>
          <SizableText size="$3" color="$color10">
            {handle}
          </SizableText>
          {hasProfile && profile?.description ? (
            <SizableText size="$3" color="$color11" numberOfLines={2}>
              {profile.description}
            </SizableText>
          ) : !hasProfile ? (
            <SizableText size="$3" color="$color11">
              Set up your profile
            </SizableText>
          ) : null}
        </YStack>
        <CaretRightIcon size={16} color="$color8" />
      </XStack>
    </Pressable>
  )
}
