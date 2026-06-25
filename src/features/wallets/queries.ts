import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '~/providers/UnifiedAuthProvider'

import {
  ADDRESS_CONTROL_LEXICON,
  linkedWalletFromRecord,
  type AddressControlRecord,
  type LinkedWallet,
} from './siwe'

export function useLinkedWalletsQuery(did: string | undefined) {
  const { agent } = useAuth()

  return useQuery<LinkedWallet[]>({
    queryKey: ['linked-wallets', did],
    enabled: !!did && !!agent,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!did || !agent) return []

      const { data } = await agent.com.atproto.repo.listRecords({
        repo: did,
        collection: ADDRESS_CONTROL_LEXICON,
        limit: 100,
      })

      const seen = new Set<string>()
      const wallets: LinkedWallet[] = []

      for (const rawRecord of data.records) {
        const wallet = linkedWalletFromRecord(
          rawRecord as {
            uri: string
            value: {
              address?: { $bytes: string }
              siwe?: { address?: string; chainId?: number }
              alsoOn?: number[]
            }
          },
        )
        if (!wallet) continue

        const normalized = wallet.address.toLowerCase()
        if (seen.has(normalized)) continue
        seen.add(normalized)
        wallets.push(wallet)
      }

      return wallets
    },
  })
}

export function useCreateLinkedWalletMutation(did: string | undefined) {
  const { agent } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (record: AddressControlRecord) => {
      if (!agent || !did) throw new Error('ATProto session is unavailable')
      const result = await agent.com.atproto.repo.createRecord({
        repo: did,
        collection: ADDRESS_CONTROL_LEXICON,
        record,
      })
      if (!result.success) throw new Error('createRecord returned unsuccessful')
      return result.data.uri
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linked-wallets', did] })
    },
  })
}

export function useDeleteLinkedWalletMutation(did: string | undefined) {
  const { agent } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (atUri: string) => {
      if (!agent || !did) throw new Error('ATProto session is unavailable')
      const rkey = atUri.split('/').at(-1)
      if (!rkey) throw new Error(`Could not parse rkey from URI: ${atUri}`)

      await agent.com.atproto.repo.deleteRecord({
        repo: did,
        collection: ADDRESS_CONTROL_LEXICON,
        rkey,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linked-wallets', did] })
    },
  })
}
