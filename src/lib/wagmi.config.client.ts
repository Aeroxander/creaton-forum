import { createConfig, http } from 'wagmi'
import { injected } from 'wagmi/connectors'

import {
  configuredTempoChainId,
  SUPPORTED_WALLET_CHAINS,
  tempoMainnet,
  tempoTestnet,
} from '~/features/wallets/chains'

const isDev = import.meta.env.DEV
const defaultChainId = configuredTempoChainId()

const walletChains = SUPPORTED_WALLET_CHAINS.map((entry) => entry.chain)
const defaultChain =
  walletChains.find((chain) => chain.id === defaultChainId) ??
  (isDev ? tempoTestnet : tempoMainnet)
const otherChains = walletChains.filter((chain) => chain.id !== defaultChain.id)

export { tempoMainnet, tempoTestnet }

export const wagmiConfig = createConfig({
  chains: [defaultChain, ...otherChains],
  connectors: [injected()],
  transports: Object.fromEntries(
    walletChains.map((chain) => [chain.id, http()]),
  ),
  ssr: false,
})
