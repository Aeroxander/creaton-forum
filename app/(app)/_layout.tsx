import type { ReactNode } from 'react'
import { Redirect, Slot, Stack, usePathname, type Href } from 'one'
import { isWeb, Spinner, SizableText, YStack } from 'tamagui'

import { PlatformSpecificRootProvider } from '~/interface/platform/PlatformSpecificRootProvider'
import { hasStoredAuthSession } from '~/providers/authContext'
import { useAuth } from '~/providers/UnifiedAuthProvider'

function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const pathname = usePathname()

  const isProtected = pathname.startsWith('/home')
  const isAuthRoute = pathname === '/login' || pathname === '/register'

  if (status === 'loading' && hasStoredAuthSession()) {
    return (
      <YStack flex={1} items="center" justify="center" minH="100vh" gap="$3">
        <Spinner size="large" />
        <SizableText opacity={0.7}>Restoring your session…</SizableText>
      </YStack>
    )
  }

  const effectiveStatus = status === 'loading' ? 'signedOut' : status

  if (effectiveStatus === 'signedOut' && isProtected) {
    return <Redirect href={'/login' as Href} />
  }

  if (effectiveStatus === 'signedIn' && isAuthRoute) {
    return <Redirect href={'/home/forums' as Href} />
  }

  return children
}

export function AppLayout() {
  return (
    <PlatformSpecificRootProvider>
      <AuthGate>
        {isWeb ? (
          <Slot />
        ) : (
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="home" />
          </Stack>
        )}
      </AuthGate>
    </PlatformSpecificRootProvider>
  )
}
