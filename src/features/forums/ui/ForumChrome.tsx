import { Link, type Href } from 'one'
import { ScrollView, SizableText, XStack, YStack } from 'tamagui'

import { Button } from '~/interface/buttons/Button'

const FORUM_STORY_SKELETONS = ['one', 'two', 'three', 'four', 'five', 'six']

export function ForumPage({
  title,
  children,
  action,
  headerContent,
}: {
  title: string
  children: React.ReactNode
  action?: React.ReactNode
  headerContent?: React.ReactNode
}) {
  return (
    <YStack flex={1} gap="$4" py="$4">
      <YStack gap="$3">
        <XStack items="center" justify="space-between" gap="$3">
          <SizableText size="$8" fontWeight="700">
            {title}
          </SizableText>
          {action}
        </XStack>
        {headerContent}
      </YStack>
      {children}
    </YStack>
  )
}

export function ForumPanel({ children }: { children: React.ReactNode }) {
  return (
    <YStack
      bg="$color2"
      borderWidth={1}
      borderColor="$color5"
      rounded="$4"
      overflow="hidden"
    >
      {children}
    </YStack>
  )
}

export function ForumSectionHeader({ title }: { title: string }) {
  return (
    <XStack px="$4" py="$3" bg="$color3" borderBottomWidth={1} borderColor="$color5">
      <SizableText size="$4" fontWeight="600">
        {title}
      </SizableText>
    </XStack>
  )
}

export function ForumEmpty({ message }: { message: string }) {
  return (
    <YStack p="$6" items="center" justify="center">
      <SizableText opacity={0.6}>{message}</SizableText>
    </YStack>
  )
}

export function ForumSortPicker({
  value,
  onChange,
}: {
  value: 'active' | 'new' | 'top'
  onChange: (value: 'active' | 'new' | 'top') => void
}) {
  const options: Array<'active' | 'new' | 'top'> = ['active', 'new', 'top']
  return (
    <XStack gap="$2">
      {options.map((option) => (
        <Button
          key={option}
          size="$3"
          theme={value === option ? 'blue' : undefined}
          variant={value === option ? undefined : 'outlined'}
          onPress={() => onChange(option)}
        >
          {option}
        </Button>
      ))}
    </XStack>
  )
}

export type ForumBoardStory = {
  uri: string
  title: string
  did: string
  rkey: string
  isUnseen?: boolean
}

function boardInitials(title: string) {
  const words = title
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return '?'
  const first = words[0]!
  if (words.length === 1) return first.slice(0, 2).toUpperCase()
  const second = words[1]!
  return `${first[0] ?? ''}${second[0] ?? ''}`.toUpperCase()
}

export function ForumUnreadDot() {
  return <YStack width={8} height={8} rounded="$10" bg="$red10" shrink={0} />
}

export function ForumBoardStoryRail({
  boards,
  isLoading,
}: {
  boards: ForumBoardStory[]
  isLoading?: boolean
}) {
  if (isLoading) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <XStack gap="$3" px="$1" py="$2">
          {FORUM_STORY_SKELETONS.map((id) => (
            <YStack key={id} width={72} items="center" gap="$2">
              <YStack
                width={56}
                height={56}
                rounded="$10"
                bg="$color4"
                opacity={0.6}
              />
              <YStack width={48} height={10} rounded="$2" bg="$color4" opacity={0.6} />
            </YStack>
          ))}
        </XStack>
      </ScrollView>
    )
  }

  if (boards.length === 0) return null

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <XStack gap="$3" px="$1" py="$2">
        {boards.map((board) => (
          <Link
            key={board.uri}
            href={`/home/forums/${board.did}/${board.rkey}` as Href}
          >
            <YStack width={72} items="center" gap="$2" cursor="pointer">
              <YStack
                width={56}
                height={56}
                rounded="$10"
                bg="$color4"
                items="center"
                justify="center"
                borderWidth={board.isUnseen ? 2 : 0}
                borderColor={board.isUnseen ? '$blue10' : undefined}
              >
                <SizableText size="$4" fontWeight="700">
                  {boardInitials(board.title)}
                </SizableText>
              </YStack>
              <XStack items="center" gap="$1" maxW={72}>
                <SizableText size="$2" numberOfLines={2} text="center">
                  {board.title}
                </SizableText>
                {board.isUnseen ? <ForumUnreadDot /> : null}
              </XStack>
            </YStack>
          </Link>
        ))}
      </XStack>
    </ScrollView>
  )
}

export function ForumBoardRow({
  href,
  title,
  description,
  meta,
  isUnread,
}: {
  href: Href
  title: string
  description?: string
  meta?: string
  isUnread?: boolean
}) {
  return (
    <Link href={href}>
      <YStack
        px="$4"
        py="$3"
        gap="$1"
        borderBottomWidth={1}
        borderColor="$color5"
        hoverStyle={{ bg: '$color3' }}
        pressStyle={{ bg: '$color4' }}
        cursor="pointer"
      >
        <XStack items="center" gap="$2">
          {isUnread ? <ForumUnreadDot /> : null}
          <SizableText size="$5" fontWeight="600" flex={1}>
            {title}
          </SizableText>
        </XStack>
        {description ? (
          <SizableText size="$3" opacity={0.7} numberOfLines={2}>
            {description}
          </SizableText>
        ) : null}
        {meta ? (
          <SizableText size="$2" opacity={0.5}>
            {meta}
          </SizableText>
        ) : null}
      </YStack>
    </Link>
  )
}

export function ForumTopicRow({
  href,
  title,
  meta,
  score,
  isUnread,
}: {
  href: Href
  title: string
  meta?: string
  score?: number
  isUnread?: boolean
}) {
  return (
    <Link href={href}>
      <XStack
        px="$4"
        py="$3"
        gap="$3"
        items="center"
        borderBottomWidth={1}
        borderColor="$color5"
        hoverStyle={{ bg: '$color3' }}
        pressStyle={{ bg: '$color4' }}
        cursor="pointer"
      >
        <YStack width={36} items="center">
          <SizableText size="$3" fontWeight="700">
            {score ?? 0}
          </SizableText>
        </YStack>
        <YStack flex={1} gap="$1">
          <XStack items="center" gap="$2">
            {isUnread ? <ForumUnreadDot /> : null}
            <SizableText size="$4" fontWeight="600" flex={1}>
              {title}
            </SizableText>
          </XStack>
          {meta ? (
            <SizableText size="$2" opacity={0.5}>
              {meta}
            </SizableText>
          ) : null}
        </YStack>
      </XStack>
    </Link>
  )
}
