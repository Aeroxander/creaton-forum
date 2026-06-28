import { useState } from 'react'
import { SizableText, YStack } from 'tamagui'

import { Button } from '~/interface/buttons/Button'
import {
  getConfiguredOnrampChainId,
  getConfiguredOnrampChainLabel,
  selectOnrampWallet,
  validateOnrampSetup,
  type OnrampRecipient,
} from './crossmintOnramp'
import { OnrampCheckoutDialog } from './OnrampCheckoutDialog'
import { useLinkedWalletsQuery } from '~/features/wallets/queries'
import { formatUsdcAtomic, needsUsdcFunding } from './usdcAmount'

type FundWalletCalloutProps = {
  title: string
  description?: string
  did: string | undefined
  walletAddress: string | undefined
  balance: bigint | undefined
  requiredAmount: string | bigint
  onFunded?: () => void
}

export function FundWalletCallout({
  title,
  description,
  did,
  walletAddress,
  balance,
  requiredAmount,
  onFunded,
}: FundWalletCalloutProps) {
  const [open, setOpen] = useState(false)
  const wallets = useLinkedWalletsQuery(did)
  const chainId = getConfiguredOnrampChainId()
  const wallet = selectOnrampWallet(wallets.data, chainId)
  const onrampReady = validateOnrampSetup() === null
  const funded = !needsUsdcFunding(balance, requiredAmount)

  if (funded) return null

  const recipient: OnrampRecipient | null = wallet
    ? {
        did: did ?? '',
        walletAddress: wallet.address,
        chainId,
        label: `Your ${getConfiguredOnrampChainLabel()} wallet`,
      }
    : walletAddress
      ? {
          did: did ?? '',
          walletAddress,
          chainId,
          label: `Your ${getConfiguredOnrampChainLabel()} wallet`,
        }
      : null

  return (
    <YStack p="$3" bg="$blue2" borderColor="$blue8" borderWidth={1} rounded="$3" gap="$2">
      <SizableText size="$3" fontWeight="700" color="$blue11">
        {title}
      </SizableText>
      {description ? (
        <SizableText size="$2" opacity={0.8}>
          {description}
        </SizableText>
      ) : null}
      {balance !== undefined && (
        <SizableText size="$2" opacity={0.8}>
          Current balance: {formatUsdcAtomic(balance)} USDC · Required: {formatUsdcAtomic(requiredAmount)} USDC
        </SizableText>
      )}
      <Button
        size="$2"
        theme="blue"
        disabled={!recipient || !onrampReady}
        onPress={() => setOpen(true)}
      >
        Add funds with card
      </Button>
      <OnrampCheckoutDialog
        defaultAmount="10"
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen)
          if (!nextOpen) onFunded?.()
        }}
        open={open}
        recipient={recipient}
        submitLabel="Continue to checkout"
        title="Add USDC to your wallet"
      />
    </YStack>
  )
}
