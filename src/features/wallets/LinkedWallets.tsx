import { SizableText, XStack, YStack } from 'tamagui'

import { Button } from '~/interface/buttons/Button'

import { useDeleteLinkedWalletMutation, useLinkedWalletsQuery } from './queries'
import { formatShortAddress, getChainLabel } from './siwe'

export function LinkedWallets({
  did,
  canManage = false,
  compact = false,
}: {
  did: string | undefined
  canManage?: boolean
  compact?: boolean
}) {
  const wallets = useLinkedWalletsQuery(did)
  const deleteWallet = useDeleteLinkedWalletMutation(did)

  if (!did || wallets.isLoading || !wallets.data?.length) return null

  return (
    <XStack flexWrap="wrap" gap="$2" mt={compact ? 0 : '$3'}>
      {wallets.data.map((wallet) => (
        <XStack
          key={wallet.uri}
          items="center"
          gap="$2"
          bg="$color3"
          rounded="$10"
          px="$3"
          py="$1"
        >
          <SizableText size="$3">{formatShortAddress(wallet.address)}</SizableText>
          <SizableText size="$1" opacity={0.6}>
            {getChainLabel(wallet.primaryChainId)}
          </SizableText>
          {canManage ? (
            <Button
              size="$1"
              variant="transparent"
              onPress={() => deleteWallet.mutate(wallet.uri)}
              disabled={deleteWallet.isPending}
              aria-label={`Unlink ${wallet.address}`}
            >
              ×
            </Button>
          ) : null}
        </XStack>
      ))}
    </XStack>
  )
}

export function LinkedWalletsSection({ did }: { did: string | undefined }) {
  const wallets = useLinkedWalletsQuery(did)

  if (!did || wallets.isLoading || !wallets.data?.length) return null

  return (
    <YStack gap="$2" mt="$3">
      <SizableText size="$3" fontWeight="600">
        Linked wallets
      </SizableText>
      <LinkedWallets did={did} canManage />
    </YStack>
  )
}
