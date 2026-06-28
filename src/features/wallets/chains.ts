import { abstract, abstractTestnet, arbitrum, base, mainnet, optimism } from 'viem/chains'

export const tempoMainnet = {
  id: 4217,
  name: 'Tempo',
  nativeCurrency: { name: 'USD', symbol: 'USD', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.tempo.xyz'] } },
} as const

export const tempoTestnet = {
  id: 42429,
  name: 'Tempo Testnet',
  nativeCurrency: { name: 'USD', symbol: 'USD', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.tempo.xyz'] } },
} as const

export const TEMPO_MAINNET_CHAIN_ID = tempoMainnet.id
export const TEMPO_TESTNET_CHAIN_ID = tempoTestnet.id

export function configuredTempoChainId(): number {
  const fromEnv = import.meta.env.VITE_TEMPO_CHAIN_ID
  if (fromEnv && /^\d+$/.test(fromEnv)) return Number(fromEnv)
  return import.meta.env.DEV ? TEMPO_TESTNET_CHAIN_ID : TEMPO_MAINNET_CHAIN_ID
}

export const SUPPORTED_WALLET_CHAINS = [
  { id: tempoMainnet.id, label: 'Tempo', chain: tempoMainnet },
  { id: tempoTestnet.id, label: 'Tempo Testnet', chain: tempoTestnet },
  { id: 2741, label: 'Abstract', chain: abstract },
  { id: 11124, label: 'Abstract Testnet', chain: abstractTestnet },
  { id: 1, label: 'Ethereum', chain: mainnet },
  { id: 8453, label: 'Base', chain: base },
  { id: 10, label: 'Optimism', chain: optimism },
  { id: 42161, label: 'Arbitrum', chain: arbitrum },
] as const
