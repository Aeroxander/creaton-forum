import { SizableText, XStack, YStack } from 'tamagui'

import { FundWalletCallout } from '~/features/onramp/FundWalletCallout'
import { needsUsdcFunding } from '~/features/onramp/usdcAmount'
import { Button } from '~/interface/buttons/Button'

export function ProtectedForumBody({
  fundWallet,
  onUnlock,
  unlocking,
  paymentProtocol = 'mpp',
}: {
  fundWallet?: {
    did: string | undefined
    walletAddress: string | undefined
    balance?: bigint
    requiredAmount: string | bigint
    onFunded?: () => void
  }
  onUnlock?: () => void
  unlocking?: boolean
  paymentProtocol?: 'mpp' | 'tempo'
}) {
  const showFunding =
    fundWallet && needsUsdcFunding(fundWallet.balance, fundWallet.requiredAmount)

  return (
    <YStack gap="$3" my="$2">
      {showFunding ? (
        <FundWalletCallout
          balance={fundWallet.balance}
          description="Pay to unlock charges USDC from your wallet. Add funds with a card, then try again."
          did={fundWallet.did}
          onFunded={fundWallet.onFunded}
          requiredAmount={fundWallet.requiredAmount}
          title="Add USDC to unlock"
          walletAddress={fundWallet.walletAddress}
        />
      ) : null}

      <YStack
        p="$3"
        gap="$2"
        rounded="$4"
        borderWidth={1}
        borderColor="$blue8"
        bg="$blue2"
      >
        <SizableText size="$4" fontWeight="700" color="$blue11">
          Member-only post
        </SizableText>
        <SizableText size="$3" opacity={0.8}>
          {paymentProtocol === 'mpp'
            ? 'Pay to unlock this board. USDC is charged via MPP when access is confirmed.'
            : 'Subscribe on the board page, then unlock this post.'}
        </SizableText>
        <XStack>
          <Button
            size="$2"
            theme="blue"
            disabled={!onUnlock || unlocking || !!showFunding}
            onPress={onUnlock}
          >
            {unlocking ? 'Unlocking…' : 'Pay to unlock'}
          </Button>
        </XStack>
      </YStack>
    </YStack>
  )
}
