import { createContext, use } from 'react'

type WagmiContextValue = {
  ready: boolean
  failed: boolean
}

export const WagmiReadyContext = createContext<WagmiContextValue>({
  ready: false,
  failed: false,
})

export function useWagmiReady() {
  return use(WagmiReadyContext).ready
}

export function useWagmiFailed() {
  return use(WagmiReadyContext).failed
}
