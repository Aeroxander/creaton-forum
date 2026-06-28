import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'

function getPathUsdAddress(): `0x${string}` | undefined {
  const address = import.meta.env.VITE_TEMPO_PATHUSD_ADDRESS
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) return undefined
  return address as `0x${string}`
}

export function useWalletUsdcBalance(input?: {
  tokenAddress?: `0x${string}`
  chainId?: number
}) {
  const { address, isConnected } = useAccount()
  const tokenAddress = input?.tokenAddress ?? getPathUsdAddress()
  const query = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: input?.chainId,
    query: {
      enabled: isConnected && !!address && !!tokenAddress,
      staleTime: 15_000,
    },
  })

  return {
    address,
    isConnected,
    tokenAddress,
    balance: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    refetch: query.refetch,
    error: query.error,
  }
}
