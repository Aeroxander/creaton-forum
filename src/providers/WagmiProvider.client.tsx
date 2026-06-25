import { isWeb } from 'tamagui'
import { WagmiProvider as BaseWagmiProvider } from 'wagmi'

import { wagmiConfig } from '~/lib/wagmi.config.client'

import type { ReactNode } from 'react'

export function WagmiProviderClient({ children }: { children: ReactNode }) {
  if (!isWeb) {
    return children
  }

  return <BaseWagmiProvider config={wagmiConfig}>{children}</BaseWagmiProvider>
}
