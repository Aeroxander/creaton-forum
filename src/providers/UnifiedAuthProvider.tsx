import { useEffect, useState, type ComponentType } from 'react'

import {
  AuthContext,
  authSignedOutStub,
  authStubForBootstrap,
  type AuthProviderProps,
} from '~/providers/authContext'

export { useAuth } from '~/providers/authContext'

export function UnifiedAuthProvider({ children }: AuthProviderProps) {
  const [ClientProvider, setClientProvider] = useState<ComponentType<AuthProviderProps> | null>(
    null,
  )

  useEffect(() => {
    void import('~/providers/UnifiedAuthProvider.client')
      .then((mod) => {
        setClientProvider(() => mod.UnifiedAuthProviderClient)
      })
      .catch((error) => {
        console.error('Failed to load auth provider.', error)
        setClientProvider(() => function AuthProviderFallback({ children: inner }: AuthProviderProps) {
          return (
            <AuthContext value={{ ...authSignedOutStub, authReady: true }}>{inner}</AuthContext>
          )
        })
      })
  }, [])

  if (!ClientProvider) {
    return <AuthContext value={authStubForBootstrap()}>{children}</AuthContext>
  }

  return <ClientProvider>{children}</ClientProvider>
}
