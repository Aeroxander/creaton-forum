import { useEffect, useState } from 'react'
import { SizableText, XStack, YStack } from 'tamagui'
import { type Hex } from 'viem'
import { useAccount, useConnect, useDisconnect, useSignMessage } from 'wagmi'
import { injected } from 'wagmi/connectors'

import { createSiweLoginChallenge } from '~/features/auth/siweChallenges'
import { CreatonHandleInput } from '~/features/auth/CreatonHandleInput'
import {
  defaultPrimaryChainId,
  getChainLabel,
  normalizePdsUrl,
  normalizeSiweIdentifier,
} from '~/features/wallets/siwe'
import { DEFAULT_PDS_URL } from '~/constants/urls'
import { Button } from '~/interface/buttons/Button'
import { Input } from '~/interface/forms/Input'
import { useAuth } from '~/providers/UnifiedAuthProvider'

export function SiweLoginForm() {
  const { loginWithSiwe } = useAuth()
  const { address, chain, isConnected, status } = useAccount()
  const { connect, connectors, isPending: isConnectPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { signMessageAsync } = useSignMessage()
  const [identifier, setIdentifier] = useState('')
  const [serviceURL, setServiceURL] = useState(DEFAULT_PDS_URL)
  const [error, setError] = useState<string | null>(null)
  const [isSigningIn, setIsSigningIn] = useState(false)

  const isWalletConnecting = isConnectPending || status === 'connecting'
  const isBusy = isSigningIn || isWalletConnecting

  useEffect(() => {
    const lastHandle = localStorage.getItem('lastHandle')
    if (lastHandle) setIdentifier(lastHandle)
  }, [])

  const connectWallet = () => {
    setError(null)
    connect({ connector: injected(), chainId: defaultPrimaryChainId })
  }

  const handleSubmit = async () => {
    setError(null)

    const service = normalizePdsUrl(serviceURL)
    const fullIdentifier = await normalizeSiweIdentifier(identifier, service)

    if (!fullIdentifier) {
      setError('Enter your Creaton handle.')
      return
    }
    if (!isConnected || !address) {
      setError('Connect your Tempo wallet first.')
      return
    }

    setIsSigningIn(true)
    try {
      const { siweMessage } = await createSiweLoginChallenge(service, fullIdentifier)
      const signature: Hex = await signMessageAsync({ message: siweMessage })
      await loginWithSiwe(fullIdentifier, signature, service)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wallet login failed.')
    } finally {
      setIsSigningIn(false)
    }
  }

  return (
    <YStack gap="$3">
      <SizableText size="$2" opacity={0.7}>
        Sign in to a Creaton account using the Tempo wallet linked to that account.
      </SizableText>

      <CreatonHandleInput value={identifier} onChange={setIdentifier} />
      <Input
        placeholder="Creaton PDS"
        value={serviceURL}
        onChangeText={setServiceURL}
        autoCapitalize="none"
      />

      {isConnected && address ? (
        <XStack
          items="center"
          justify="space-between"
          gap="$3"
          bg="$color3"
          rounded="$4"
          px="$3"
          py="$2"
        >
          <SizableText size="$3" fontWeight="500">
            {address.slice(0, 6)}...{address.slice(-4)}
            {chain ? ` · ${getChainLabel(chain.id)}` : ''}
          </SizableText>
          <Button size="$2" variant="outlined" onPress={() => disconnect()}>
            Disconnect
          </Button>
        </XStack>
      ) : (
        <Button theme="blue" onPress={connectWallet} disabled={isBusy || connectors.length === 0}>
          Connect {getChainLabel(defaultPrimaryChainId)} wallet
        </Button>
      )}

      {error ? (
        <SizableText color="$red10" size="$2">
          {error}
        </SizableText>
      ) : null}

      <Button theme="blue" onPress={handleSubmit} disabled={isBusy || !isConnected}>
        {isSigningIn ? 'Signing in…' : 'Log in with wallet signature'}
      </Button>
    </YStack>
  )
}
