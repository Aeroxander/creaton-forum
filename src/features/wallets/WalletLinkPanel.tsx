import { useMemo, useState } from 'react'
import { Checkbox, Label, SizableText, XStack, YStack } from 'tamagui'
import { type Hex } from 'viem'
import {
  useAccount,
  useBalance,
  useConnect,
  useDisconnect,
  useSignMessage,
  useSwitchChain,
} from 'wagmi'
import { injected } from 'wagmi/connectors'

import { Button } from '~/interface/buttons/Button'
import { showToast } from '~/interface/toast/helpers'

import { useCreateLinkedWalletMutation, useLinkedWalletsQuery } from './queries'
import {
  buildAddressControlRecord,
  createWalletLinkSiweMessage,
  defaultPrimaryChainId,
  type DidString,
  formatShortAddress,
  getChainLabel,
  isSupportedChainId,
  randomNonce,
  SUPPORTED_CHAINS,
  verifyWalletLinkSignature,
} from './siwe'

export function WalletLinkPanel({ did }: { did: string | undefined }) {
  const { address, chain, isConnected, status } = useAccount()
  const { data: balance } = useBalance({ address })
  const { connect, connectors, isPending: isConnectPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitchPending } = useSwitchChain()
  const { signMessageAsync } = useSignMessage()
  const wallets = useLinkedWalletsQuery(did)
  const createWallet = useCreateLinkedWalletMutation(did)

  const [primaryChainId, setPrimaryChainId] = useState<number>(() =>
    isSupportedChainId(chain?.id) ? chain.id : defaultPrimaryChainId,
  )
  const [alsoOn, setAlsoOn] = useState<Set<number>>(() => new Set())
  const [error, setError] = useState<string | null>(null)

  const signingAddress = address
  const isWalletConnecting = status === 'connecting' || isConnectPending
  const isBusy = isWalletConnecting || isSwitchPending || createWallet.isPending

  const existingWallet = useMemo(() => {
    if (!signingAddress) return undefined
    return wallets.data?.find(
      (wallet) => wallet.address.toLowerCase() === signingAddress.toLowerCase(),
    )
  }, [signingAddress, wallets.data])

  const formattedBalance = balance
    ? `${Number.parseFloat(balance.formatted).toFixed(4)} ${balance.symbol}`
    : undefined

  const connectWallet = () => {
    setError(null)
    connect({ connector: injected(), chainId: defaultPrimaryChainId })
  }

  const linkWallet = async () => {
    if (!did || !signingAddress) return
    if (existingWallet) {
      setError('This wallet is already linked.')
      return
    }

    const typedDid = did as DidString
    const nonce = randomNonce()
    const issuedAt = new Date()
    const message = createWalletLinkSiweMessage({
      address: signingAddress,
      did: typedDid,
      chainId: primaryChainId,
      nonce,
      issuedAt,
    })

    setError(null)
    try {
      const signature: Hex = await signMessageAsync({ message })

      try {
        await verifyWalletLinkSignature({
          chainId: primaryChainId,
          message,
          signature,
          address: signingAddress,
          nonce,
          issuedAt,
        })
      } catch (verifyError) {
        console.warn('SIWE verify warning:', verifyError)
      }

      await createWallet.mutateAsync(
        buildAddressControlRecord({
          address: signingAddress,
          did: typedDid,
          signature,
          chainId: primaryChainId,
          nonce,
          issuedAt,
          alsoOn: Array.from(alsoOn),
        }),
      )

      showToast('Wallet linked')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to link wallet'
      setError(message)
      showToast('Wallet link failed', { type: 'error' })
    }
  }

  return (
    <YStack gap="$3" bg="$color2" rounded="$4" p="$4">
      <YStack gap="$1">
        <SizableText size="$4" fontWeight="600">
          Creaton wallet
        </SizableText>
        <SizableText size="$2" opacity={0.7}>
          Link a Tempo wallet to your ATProto account for Creaton features.
        </SizableText>
      </YStack>

      {!isConnected ? (
        <Button theme="blue" onPress={connectWallet} disabled={isBusy || connectors.length === 0}>
          Connect {getChainLabel(defaultPrimaryChainId)} wallet
        </Button>
      ) : (
        <YStack gap="$4">
          <YStack gap="$1" bg="$color3" rounded="$4" p="$3">
            <XStack items="center" justify="space-between" gap="$2" flexWrap="wrap">
              <YStack>
                <SizableText size="$3" fontWeight="500">
                  {formatShortAddress(address ?? '')}
                  {chain ? ` · ${chain.name}` : ''}
                </SizableText>
                {formattedBalance ? (
                  <SizableText size="$1" opacity={0.6}>
                    {formattedBalance}
                  </SizableText>
                ) : null}
              </YStack>
              <Button size="$2" variant="outlined" onPress={() => disconnect()}>
                Disconnect
              </Button>
            </XStack>
          </YStack>

          <YStack gap="$2">
            <SizableText size="$3" fontWeight="500">
              Primary chain
            </SizableText>
            <XStack flexWrap="wrap" gap="$2">
              {SUPPORTED_CHAINS.map(({ id, label }) => (
                <Button
                  key={id}
                  size="$2"
                  variant={primaryChainId === id ? 'default' : 'outlined'}
                  onPress={() => setPrimaryChainId(id)}
                >
                  {label}
                </Button>
              ))}
            </XStack>
          </YStack>

          <YStack gap="$2">
            <SizableText size="$3" fontWeight="500">
              Also active on
            </SizableText>
            <YStack gap="$2">
              {SUPPORTED_CHAINS.filter(({ id }) => id !== primaryChainId).map(({ id, label }) => (
                <XStack key={id} items="center" gap="$2">
                  <Checkbox
                    id={`chain-${id}`}
                    checked={alsoOn.has(id)}
                    onCheckedChange={(checked) => {
                      setAlsoOn((prev) => {
                        const next = new Set(prev)
                        if (checked === true) next.add(id)
                        else next.delete(id)
                        return next
                      })
                    }}
                  >
                    <Checkbox.Indicator />
                  </Checkbox>
                  <Label htmlFor={`chain-${id}`} size="$3">
                    {label}
                  </Label>
                </XStack>
              ))}
            </YStack>
          </YStack>

          {chain && chain.id !== primaryChainId ? (
            <Button
              variant="outlined"
              onPress={() => switchChain({ chainId: primaryChainId })}
              disabled={isBusy}
            >
              Switch wallet to {getChainLabel(primaryChainId)}
            </Button>
          ) : null}

          <Button
            theme="blue"
            onPress={linkWallet}
            disabled={isBusy || !did || !address || !!existingWallet}
          >
            {existingWallet
              ? 'Wallet already linked'
              : createWallet.isPending
                ? 'Linking…'
                : 'Link wallet'}
          </Button>
        </YStack>
      )}

      {error ? (
        <SizableText size="$2" color="$red10">
          {error}
        </SizableText>
      ) : null}
    </YStack>
  )
}
