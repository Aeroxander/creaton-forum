import { abstractWalletConnector } from '@abstract-foundation/agw-react/connectors'
import { abstract, abstractTestnet, arbitrum, base, mainnet, optimism } from 'viem/chains'
import { createConfig, http } from 'wagmi'
import { injected } from 'wagmi/connectors'

const isDev = import.meta.env.DEV

export const wagmiConfig = createConfig({
  chains: isDev
    ? [abstractTestnet, mainnet, base, optimism, arbitrum]
    : [abstract, abstractTestnet, mainnet, base, optimism, arbitrum],
  connectors: [injected(), abstractWalletConnector()],
  transports: {
    [abstract.id]: http(),
    [abstractTestnet.id]: http(),
    [mainnet.id]: http(),
    [base.id]: http(),
    [optimism.id]: http(),
    [arbitrum.id]: http(),
  },
  ssr: false,
})
