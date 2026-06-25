import { Link, type Href } from 'one'
import { lazy, Suspense } from 'react'
import { Linking } from 'react-native'
import { isWeb, SizableText, Spinner, View, XStack, YStack } from 'tamagui'

import { APP_NAME_LOWERCASE, DOMAIN } from '~/constants/app'
import { LinkedWalletsSection } from '~/features/wallets/LinkedWallets'
import { ProfileSummary } from '~/features/profile/ProfileSummary'
import { useAuth } from '~/providers/UnifiedAuthProvider'
import { PageContainer } from '~/interface/layout/PageContainer'
import { useWagmiReady } from '~/providers/wagmiContext'
import { CaretRightIcon } from '~/interface/icons/phosphor/CaretRightIcon'
import { DoorIcon } from '~/interface/icons/phosphor/DoorIcon'
import { UserIcon } from '~/interface/icons/phosphor/UserIcon'
import { PageLayout } from '~/interface/pages/PageLayout'
import { SepHeading } from '~/interface/text/Headings'

import type { IconComponent } from '~/interface/icons/types'

const WalletLinkPanel = lazy(() =>
  import('~/features/wallets/WalletLinkPanel').then((mod) => ({
    default: mod.WalletLinkPanel,
  })),
)

interface SettingItem {
  id: string
  title: string
  icon?: IconComponent
  onPress?: () => void
  href?: Href
  external?: boolean
}

interface SettingSection {
  title: string
  items: SettingItem[]
}

function SettingRow({ item }: { item: SettingItem }) {
  const Icon = item.icon

  const content = (
    <XStack
      cursor="pointer"
      height={56}
      px="$4"
      items="center"
      justify="space-between"
      hoverStyle={{ bg: '$color2' }}
      {...(item.onPress && { onPress: item.onPress })}
    >
      <XStack gap="$3" items="center" flex={1}>
        {Icon && (
          <View width={24} items="center" justify="center">
            <Icon size={20} color="$color11" />
          </View>
        )}
        <SizableText size="$5">{item.title}</SizableText>
      </XStack>
      <CaretRightIcon size={16} color="$color8" />
    </XStack>
  )

  if (item.onPress) {
    return content
  }

  if (item.href) {
    if (item.external && !isWeb) {
      return (
        <XStack
          cursor="pointer"
          height={56}
          px="$4"
          items="center"
          justify="space-between"
          hoverStyle={{ bg: '$color2' }}
          onPress={() => Linking.openURL(`https://${DOMAIN}${item.href as string}`)}
        >
          <XStack gap="$3" items="center" flex={1}>
            {Icon && (
              <View width={24} items="center" justify="center">
                <Icon size={20} color="$color11" />
              </View>
            )}
            <SizableText size="$5">{item.title}</SizableText>
          </XStack>
          <CaretRightIcon size={16} color="$color8" />
        </XStack>
      )
    }

    return (
      <Link href={item.href} target={item.external ? '_blank' : undefined} asChild>
        {content}
      </Link>
    )
  }

  return null
}

export function ProfileSettingsPage() {
  const { logout, agent, status } = useAuth()
  const wagmiReady = useWagmiReady()
  const did = agent?.did

  const sections: SettingSection[] = [
    {
      title: 'Account',
      items: [
        {
          id: 'profile',
          title: 'Edit Profile',
          icon: UserIcon,
          href: '/home/settings/edit-profile',
        },
      ],
    },
    {
      title: 'Other',
      items: [
        {
          id: 'logout',
          title: 'Log Out',
          icon: DoorIcon,
          onPress: logout,
        },
      ],
    },
  ]

  return (
    <PageLayout useImage>
      <PageContainer>
        <YStack pb="$10" gap="$2">
          <ProfileSummary />

          {isWeb && status === 'signedIn' && wagmiReady ? (
            <YStack mb="$6" ml="$4" mr="$4">
              <SepHeading>Wallet</SepHeading>
              <Suspense
                fallback={
                  <YStack py="$4" items="center">
                    <Spinner size="small" />
                  </YStack>
                }
              >
                <WalletLinkPanel did={did} />
              </Suspense>
              <LinkedWalletsSection did={did} />
            </YStack>
          ) : null}

          {sections.map((section) => (
            <YStack key={section.title} mb="$6" ml="$4">
              <SepHeading>{section.title}</SepHeading>
              <YStack>
                {section.items.map((item) => (
                  <SettingRow key={item.id} item={item} />
                ))}
              </YStack>
            </YStack>
          ))}

          <LogoAndVersion />
        </YStack>
      </PageContainer>
    </PageLayout>
  )
}

function LogoAndVersion() {
  return (
    <YStack items="center" pb={100} pt="$4">
      <XStack items="center" gap="$2">
        <SizableText color="$color10" fontWeight="bold">
          {APP_NAME_LOWERCASE}
        </SizableText>
      </XStack>
      <SizableText size="$1" color="$color10" mt="$2">
        v1.0.0
      </SizableText>
    </YStack>
  )
}

export default ProfileSettingsPage
