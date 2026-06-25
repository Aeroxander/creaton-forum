import { useEffect, useState, type ComponentType, type ReactNode } from 'react'

import { WagmiReadyContext } from '~/providers/wagmiContext'

type WagmiProviderProps = { children: ReactNode }

const wagmiClientImport =
  typeof window !== 'undefined' ? import('~/providers/WagmiProvider.client') : null

export function WagmiProvider({ children }: WagmiProviderProps) {
  const [ClientProvider, setClientProvider] = useState<ComponentType<WagmiProviderProps> | null>(
    null,
  )
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!wagmiClientImport) return

    void wagmiClientImport
      .then((mod) => {
        setClientProvider(() => mod.WagmiProviderClient)
      })
      .catch((error) => {
        console.error('Failed to load wallet provider.', error)
        setFailed(true)
      })
  }, [])

  const ready = ClientProvider !== null && !failed

  if (typeof window === 'undefined' || !ClientProvider) {
    return (
      <WagmiReadyContext value={{ ready: false, failed }}>{children}</WagmiReadyContext>
    )
  }

  return (
    <WagmiReadyContext value={{ ready, failed }}>
      <ClientProvider>{children}</ClientProvider>
    </WagmiReadyContext>
  )
}
