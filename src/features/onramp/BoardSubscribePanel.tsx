import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { SizableText, YStack } from 'tamagui'
import { useSwitchChain, useWalletClient } from 'wagmi'

import { useAuth } from '~/providers/UnifiedAuthProvider'
import { Button } from '~/interface/buttons/Button'
import { showToast } from '~/interface/toast/helpers'
import type { CreatonForumAccessPolicy } from '@creaton/forum-core'

import {
  activateCreatorBoardSubscription,
  boardAccessAmount,
  formatSubscriptionPeriod,
} from '~/features/forums/crypto/forumBoardSubscription'
import { FundWalletCallout } from './FundWalletCallout'
import { useWalletUsdcBalance } from './useWalletUsdcBalance'
import { formatUsdcAtomic, needsUsdcFunding, usdcAtomicToUsdString } from './usdcAmount'

type BoardSubscribePanelProps = {
  boardUri: string
  access: CreatonForumAccessPolicy
  supportLabel?: string
  onSubscribed?: (entitlement: {
    validFrom: string
    validUntil: string
    paymentRef: string | null
  }) => void
}

export function BoardSubscribePanel({
  boardUri,
  access,
  supportLabel = 'Supporter',
  onSubscribed,
}: BoardSubscribePanelProps) {
  const { agent } = useAuth()
  const { data: walletClient } = useWalletClient()
  const { switchChainAsync } = useSwitchChain()
  const wallet = useWalletUsdcBalance({
    tokenAddress: access.asset as `0x${string}`,
    chainId: access.chainId,
  })
  const [error, setError] = useState<string | null>(null)
  const requiredAmount = boardAccessAmount(access)
  const needsFunding = wallet.isConnected && needsUsdcFunding(wallet.balance, requiredAmount)

  const subscribe = useMutation({
    mutationFn: async () => {
      if (!agent?.did || !walletClient?.account) {
        throw new Error('Sign in and connect your Tempo wallet before subscribing.')
      }
      if (walletClient.chain?.id !== access.chainId) {
        await switchChainAsync({ chainId: access.chainId })
      }
      return activateCreatorBoardSubscription({
        agent,
        walletClient,
        boardUri,
        issuerDid: access.issuerDid,
        issuerEndpoint: access.issuerEndpoint,
        chainId: access.chainId,
      })
    },
    onSuccess: (result) => {
      setError(null)
      showToast('Subscription active', {
        message: `${supportLabel} access is now active for this board.`,
        type: 'success',
      })
      onSubscribed?.(result.entitlement)
    },
    onError: (cause) => {
      const message = cause instanceof Error ? cause.message : 'Unable to subscribe to this board.'
      setError(message)
      showToast('Subscription failed', { message, type: 'error' })
    },
  })

  return (
    <YStack p="$3" gap="$3" bg="$color2" borderWidth={1} borderColor="$color5" rounded="$4">
      <YStack gap="$1">
        <SizableText size="$4" fontWeight="700">
          Creator board access
        </SizableText>
        <SizableText size="$3" opacity={0.7}>
          {supportLabel} access is {formatUsdcAtomic(requiredAmount)} PathUSD for{' '}
          {formatSubscriptionPeriod(access)}. Subscriptions renew on Tempo; save a card in billing
          settings for automatic top-ups.
        </SizableText>
      </YStack>

      {needsFunding && (
        <FundWalletCallout
          balance={wallet.balance}
          description="Subscribe with PathUSD from your wallet, or add funds with a card first."
          did={agent?.did}
          onFunded={() => void wallet.refetch()}
          requiredAmount={requiredAmount}
          title="Add PathUSD to subscribe"
          walletAddress={wallet.address}
        />
      )}

      {error && (
        <YStack p="$3" bg="$red2" rounded="$3">
          <SizableText size="$3" color="$red11">
            {error}
          </SizableText>
        </YStack>
      )}

      <Button
        theme="blue"
        disabled={!agent?.did || !walletClient || subscribe.isPending || needsFunding}
        onPress={() => subscribe.mutate()}
      >
        {subscribe.isPending
          ? 'Subscribing…'
          : `Subscribe for ${usdcAtomicToUsdString(requiredAmount)} / ${formatSubscriptionPeriod(access)}`}
      </Button>
    </YStack>
  )
}
