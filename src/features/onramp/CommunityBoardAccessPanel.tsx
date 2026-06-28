import { SizableText, YStack } from 'tamagui'

import type { CreatonForumAccessPolicy } from '@creaton/forum-core'

import { FundWalletCallout } from '~/features/onramp/FundWalletCallout'
import { useWalletUsdcBalance } from '~/features/onramp/useWalletUsdcBalance'
import { formatUsdcAtomic, needsUsdcFunding } from '~/features/onramp/usdcAmount'
import { useAuth } from '~/providers/UnifiedAuthProvider'

function formatDuration(seconds: number): string {
  const days = Math.round(seconds / 86_400)
  if (days % 365 === 0) return `${days / 365} year${days / 365 === 1 ? '' : 's'}`
  if (days % 30 === 0) return `${days / 30} month${days / 30 === 1 ? '' : 's'}`
  return `${days} day${days === 1 ? '' : 's'}`
}

function historyPolicyLabel(policy: CreatonForumAccessPolicy['historyPolicy']): string {
  if (policy === 'full') return 'Full archive'
  if (policy === 'window') return 'Recent subscription window'
  return 'From first purchase onward'
}

export function CommunityBoardAccessPanel({ access }: { access: CreatonForumAccessPolicy }) {
  const { agent, status } = useAuth()
  const wallet = useWalletUsdcBalance()
  const requiredAmount = BigInt(access.amount)
  const needsFunding =
    status === 'signedIn' && wallet.isConnected && needsUsdcFunding(wallet.balance, requiredAmount)

  return (
    <YStack p="$3" gap="$3" bg="$color2" borderWidth={1} borderColor="$color5" rounded="$4">
      <YStack gap="$1">
        <SizableText size="$4" fontWeight="700">
          Paid community board
        </SizableText>
        <SizableText size="$3" opacity={0.7}>
          Access is {formatUsdcAtomic(requiredAmount)} USDC for {formatDuration(access.durationSeconds)}.
          90% of access revenue funds weekly poster rewards.
        </SizableText>
        <SizableText size="$2" opacity={0.6}>
          Archive access: {historyPolicyLabel(access.historyPolicy)}.
        </SizableText>
        <SizableText size="$2" opacity={0.7} mt="$1">
          Open any encrypted topic and tap Pay to unlock. MPP charges USDC from your wallet when you
          unlock your first post.
        </SizableText>
      </YStack>

      {needsFunding ? (
        <FundWalletCallout
          balance={wallet.balance}
          description="Add USDC to your wallet before unlocking encrypted posts on this board."
          did={agent?.did}
          onFunded={() => void wallet.refetch()}
          requiredAmount={requiredAmount}
          title="Add USDC for board access"
          walletAddress={wallet.address}
        />
      ) : null}
    </YStack>
  )
}
