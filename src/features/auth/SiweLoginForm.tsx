import {
  useGlobalWalletSignerAccount,
  useGlobalWalletSignerClient,
} from '@abstract-foundation/agw-react'
import { useEffect, useState } from 'react'
import { SizableText, XStack, YStack } from 'tamagui'
import { type Hex } from 'viem'
import { useAccount, useConnect, useDisconnect, useSignMessage } from 'wagmi'
import { injected } from 'wagmi/connectors'

import { createSiweLoginChallenge } from '~/features/auth/siweChallenges'
import { CreatonHandleInput } from '~/features/auth/CreatonHandleInput'
import { normalizePdsUrl, normalizeSiweIdentifier } from '~/features/wallets/siwe'
import { DEFAULT_PDS_URL } from '~/constants/urls'
import { Button } from '~/interface/buttons/Button'
import { Input } from '~/interface/forms/Input'
import { useAuth } from '~/providers/UnifiedAuthProvider'

export function SiweLoginForm() {
  const { loginWithSiwe } = useAuth()
  const { address, connector, isConnected, status } = useAccount()
  const { connect, connectors, isPending: isConnectPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { signMessageAsync } = useSignMessage()
  const { data: abstractSignerClient } = useGlobalWalletSignerClient()
  const { address: abstractSignerAddress } = useGlobalWalletSignerAccount()
  const [identifier, setIdentifier] = useState('')
  const [serviceURL, setServiceURL] = useState(DEFAULT_PDS_URL)
  const [error, setError] = useState<string | null>(null)
  const [isSigningIn, setIsSigningIn] = useState(false)

  const isAbstractConnector = connector?.id === 'xyz.abs.privy'
  const signingAddress = isAbstractConnector ? abstractSignerAddress : address
  const isWalletConnecting = isConnectPending || status === 'connecting'
  const isBusy = isSigningIn || isWalletConnecting

  useEffect(() => {
    const lastHandle = localStorage.getItem('lastHandle')
    if (lastHandle) setIdentifier(lastHandle)
  }, [])

  const connectAbstract = () => {
    setError(null)
    const abstractConnector = connectors.find((item) => item.id === 'xyz.abs.privy')
    if (!abstractConnector) {
      setError('Abstract wallet connector is not available in this browser.')
      return
    }
    connect(
      { connector: abstractConnector },
      {
        onError: (err) =>
          setError(err instanceof Error ? err.message : 'Failed to connect Abstract wallet.'),
      },
    )
  }

  const connectInjected = () => {
    setError(null)
    connect({ connector: injected() })
  }

  const handleSubmit = async () => {
    setError(null)

    const service = normalizePdsUrl(serviceURL)
    const fullIdentifier = await normalizeSiweIdentifier(identifier, service)

    if (!fullIdentifier) {
      setError('Enter your Creaton handle.')
      return
    }
    if (!isConnected || !signingAddress) {
      setError('Connect your wallet first.')
      return
    }

    setIsSigningIn(true)
    try {
      const { siweMessage } = await createSiweLoginChallenge(service, fullIdentifier)
      let signature: Hex

      if (isAbstractConnector) {
        if (!abstractSignerClient) {
          throw new Error('Abstract signer is not ready. Try again in a moment.')
        }
        signature = await abstractSignerClient.signMessage({ message: siweMessage })
      } else {
        signature = await signMessageAsync({ message: siweMessage })
      }

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
        Sign in to a Creaton account using the wallet linked to that account.
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
            {isAbstractConnector ? ' · Abstract' : ''}
          </SizableText>
          <Button size="$2" variant="outlined" onPress={() => disconnect()}>
            Disconnect
          </Button>
        </XStack>
      ) : (
        <YStack gap="$2">
          <Button theme="blue" onPress={connectAbstract} disabled={isWalletConnecting || isSigningIn}>
            Connect with Abstract
          </Button>
          <Button
            variant="outlined"
            onPress={connectInjected}
            disabled={isBusy || connectors.length === 0}
          >
            Connect browser wallet
          </Button>
        </YStack>
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
