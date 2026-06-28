import { useState } from 'react'
import { SizableText, YStack } from 'tamagui'

import { useLinkedWalletsQuery } from '~/features/wallets/queries'
import { getConfiguredOnrampChainId, getConfiguredOnrampChainLabel, selectOnrampWallet, validateOnrampSetup } from './crossmintOnramp'
import { OnrampCheckoutDialog } from './OnrampCheckoutDialog'
import { Button } from '~/interface/buttons/Button'

type ProfileSupportButtonProps = {
  targetDid: string | undefined
  viewerDid: string | undefined
  displayName: string
}

export function ProfileSupportButton({ targetDid, viewerDid, displayName }: ProfileSupportButtonProps) {
  const [open, setOpen] = useState(false)
  const wallets = useLinkedWalletsQuery(targetDid)
  const chainId = getConfiguredOnrampChainId()
  const wallet = selectOnrampWallet(wallets.data, chainId)
  const onrampReady = validateOnrampSetup() === null

  if (!targetDid || targetDid === viewerDid) return null

  const unavailable = !wallet && !wallets.isPending

  if (unavailable) {
    return (
      <YStack p="$3" bg="$color3" rounded="$3">
        <SizableText size="$3" fontWeight="600">
          Support unavailable
        </SizableText>
        <SizableText size="$2" opacity={0.6}>
          {displayName} has not linked a {getConfiguredOnrampChainLabel()} wallet yet. Creators
          can link one in Settings to receive card support.
        </SizableText>
      </YStack>
    )
  }

  return (
    <>
      <Button
        size="$3"
        theme="blue"
        disabled={!wallet || !onrampReady}
        onPress={() => {
          if (wallet) setOpen(true)
        }}
      >
        {wallets.isPending ? 'Checking…' : onrampReady ? 'Support with card' : 'Support'}
      </Button>
      <OnrampCheckoutDialog
        defaultAmount="5"
        onOpenChange={setOpen}
        open={open}
        recipient={
          wallet
            ? {
                did: targetDid,
                walletAddress: wallet.address,
                chainId,
                label: displayName,
              }
            : null
        }
        submitLabel="Continue to checkout"
        title={`Support ${displayName}`}
      />
    </>
  )
}
