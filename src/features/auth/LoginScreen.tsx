import { lazy, Suspense, useState } from 'react'
import { Redirect, type Href } from 'one'
import { isWeb, Separator, SizableText, Spinner, YStack } from 'tamagui'

import { SiweModeToggle } from '~/features/auth/CreatonHandleInput'
import { PasswordLoginForm } from '~/features/auth/PasswordLoginForm'
import { PageContainer } from '~/interface/layout/PageContainer'
import { Button } from '~/interface/buttons/Button'
import { H1 } from '~/interface/text/Headings'
import { hasStoredAuthSession } from '~/providers/authContext'
import { useAuth } from '~/providers/UnifiedAuthProvider'
import { useWagmiFailed, useWagmiReady } from '~/providers/wagmiContext'

const SiweLoginForm = lazy(() =>
  import('~/features/auth/SiweLoginForm').then((mod) => ({ default: mod.SiweLoginForm })),
)
const SiweRegistrationForm = lazy(() =>
  import('~/features/auth/SiweRegistrationForm').then((mod) => ({
    default: mod.SiweRegistrationForm,
  })),
)

type SiweMode = 'siwe' | 'register'

function SiweFormFallback({ message }: { message: string }) {
  return (
    <YStack py="$3" gap="$2" items="center">
      <Spinner size="small" />
      <SizableText size="$2" opacity={0.7} text="center">
        {message}
      </SizableText>
    </YStack>
  )
}

export function LoginScreen({ initialMode = 'siwe' }: { initialMode?: SiweMode }) {
  const { status, authReady } = useAuth()
  const wagmiReady = useWagmiReady()
  const wagmiFailed = useWagmiFailed()
  const [siweMode, setSiweMode] = useState<SiweMode>(initialMode)
  const [showPasswordLogin, setShowPasswordLogin] = useState(false)

  const restoringSession = status === 'loading' && hasStoredAuthSession()
  const preparingSignIn = !authReady || (status === 'loading' && !hasStoredAuthSession())
  const showWalletLogin = wagmiReady && !wagmiFailed
  const showWalletUnavailable = wagmiFailed

  if (status === 'signedIn') {
    return <Redirect href={'/home/forums' as Href} />
  }

  if (restoringSession) {
    return (
      <YStack flex={1} items="center" justify="center" gap="$3">
        <Spinner size="large" />
        <SizableText opacity={0.7}>Restoring your session…</SizableText>
      </YStack>
    )
  }

  if (preparingSignIn) {
    return (
      <YStack flex={1} items="center" justify="center" gap="$3">
        <Spinner size="large" />
        <SizableText opacity={0.7}>Preparing sign-in…</SizableText>
      </YStack>
    )
  }

  return (
    <PageContainer>
      <YStack flex={1} py="$8" gap="$4" maxW={420} mx="auto" width="100%">
        <H1>Creaton Forum</H1>
        <SizableText opacity={0.7}>Sign in with your Creaton account</SizableText>

        {isWeb ? (
          <>
            {!showPasswordLogin ? (
              <>
                <SiweModeToggle mode={siweMode} onChange={setSiweMode} />
                {showWalletLogin ? (
                  <Suspense fallback={<SiweFormFallback message="Loading wallet sign-in…" />}>
                    {siweMode === 'siwe' ? <SiweLoginForm /> : <SiweRegistrationForm />}
                  </Suspense>
                ) : showWalletUnavailable ? (
                  <YStack gap="$1">
                    <SizableText size="$2" opacity={0.7}>
                      Wallet sign-in could not be loaded. Use password or OAuth below.
                    </SizableText>
                    {import.meta.env.DEV ? (
                      <SizableText size="$1" opacity={0.5}>
                        Check the browser console for the wallet provider load error.
                      </SizableText>
                    ) : null}
                  </YStack>
                ) : (
                  <SiweFormFallback message="Loading wallet support…" />
                )}

                <YStack items="center" gap="$2" mt="$2">
                  <Separator width="100%" />
                  <SizableText size="$2" opacity={0.6}>
                    or sign in another way
                  </SizableText>
                  <Button
                    variant="outlined"
                    width="100%"
                    onPress={() => setShowPasswordLogin(true)}
                  >
                    Password / OAuth
                  </Button>
                </YStack>
              </>
            ) : (
              <>
                <PasswordLoginForm />
                {showWalletLogin ? (
                  <Button variant="transparent" onPress={() => setShowPasswordLogin(false)}>
                    Back to wallet sign-in
                  </Button>
                ) : null}
              </>
            )}
          </>
        ) : (
          <PasswordLoginForm />
        )}
      </YStack>
    </PageContainer>
  )
}
