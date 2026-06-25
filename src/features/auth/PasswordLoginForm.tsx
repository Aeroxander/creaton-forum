import { useEffect, useState } from 'react'
import { isWeb, SizableText, XStack, YStack } from 'tamagui'

import { DEFAULT_PDS_URL } from '~/constants/urls'
import { Button } from '~/interface/buttons/Button'
import { Input } from '~/interface/forms/Input'
import { useAuth } from '~/providers/UnifiedAuthProvider'

export function PasswordLoginForm() {
  const { loginWithPassword, loginWithOAuth } = useAuth()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [service, setService] = useState(DEFAULT_PDS_URL)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const lastHandle = localStorage.getItem('lastHandle')
    if (lastHandle) setIdentifier(lastHandle)
  }, [])

  const handlePasswordLogin = async () => {
    setError(null)
    setLoading(true)
    try {
      localStorage.setItem('lastHandle', identifier.trim())
      await loginWithPassword(identifier.trim(), password, service.trim())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleOAuthLogin = async () => {
    setError(null)
    if (!identifier.trim()) {
      setError('Enter your handle or PDS URL for OAuth')
      return
    }
    await loginWithOAuth(identifier.trim())
  }

  return (
    <YStack gap="$3">
      <SizableText size="$2" color="$red10">
        Less secure. Use an App Password, not your main account password.
      </SizableText>

      <Input
        placeholder="Handle or DID"
        value={identifier}
        onChangeText={setIdentifier}
        autoCapitalize="none"
      />
      <Input
        placeholder="App password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
      />
      <Input
        placeholder="PDS URL"
        value={service}
        onChangeText={setService}
        autoCapitalize="none"
      />

      {error ? (
        <SizableText color="$red10" size="$3">
          {error}
        </SizableText>
      ) : null}

      <XStack gap="$3">
        <Button flex={1} theme="blue" onPress={handlePasswordLogin} disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
        {isWeb ? (
          <Button flex={1} variant="outlined" onPress={handleOAuthLogin}>
            OAuth
          </Button>
        ) : null}
      </XStack>
    </YStack>
  )
}
