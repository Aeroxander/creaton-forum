import { SizableText, XStack, YStack } from 'tamagui'

import { defaultSiweUserDomain } from '~/features/wallets/siwe'
import { Input } from '~/interface/forms/Input'

function shouldShowHandleSuffix(value: string) {
  const trimmed = value.trim()
  return (
    !trimmed ||
    (!trimmed.includes('@') && !trimmed.includes('.') && !trimmed.startsWith('did:'))
  )
}

export function CreatonHandleInput({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const showSuffix = shouldShowHandleSuffix(value)

  return (
    <YStack position="relative">
      <Input
        placeholder="Creaton handle"
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
        pr={showSuffix ? '$12' : undefined}
      />
      {showSuffix ? (
        <YStack position="absolute" t={0} b={0} r="$3" justify="center" pointerEvents="none">
          <SizableText size="$3" opacity={0.6}>
            {defaultSiweUserDomain}
          </SizableText>
        </YStack>
      ) : null}
    </YStack>
  )
}

export function SiweModeToggle({
  mode,
  onChange,
}: {
  mode: 'siwe' | 'register'
  onChange: (mode: 'siwe' | 'register') => void
}) {
  return (
    <XStack gap="$2">
      <SiweModeButton
        label="Sign in"
        active={mode === 'siwe'}
        onPress={() => onChange('siwe')}
      />
      <SiweModeButton
        label="Register"
        active={mode === 'register'}
        onPress={() => onChange('register')}
      />
    </XStack>
  )
}

function SiweModeButton({
  label,
  active,
  onPress,
}: {
  label: string
  active: boolean
  onPress: () => void
}) {
  return (
    <YStack
      flex={1}
      py="$2"
      px="$3"
      rounded="$4"
      bg={active ? '$color4' : '$color2'}
      cursor="pointer"
      onPress={onPress}
      items="center"
    >
      <SizableText size="$3" fontWeight={active ? '600' : '400'}>
        {label}
      </SizableText>
    </YStack>
  )
}
