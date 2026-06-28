import { useAbstractClient } from '@abstract-foundation/agw-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import type { CreatonForumAccessPolicy, CreatonForumBoardRecord } from '@creaton/forum-core'

import { loadForumAccessSession } from '~/features/forums/crypto/forumAccessSession'
import { isProductionForumCrypto } from '~/features/forums/crypto/forumCryptoMode'
import { useAuth } from '~/providers/UnifiedAuthProvider'

export type ForumBoardEntitlement = {
  validFrom: string
  validUntil: string
  paymentRef: string | null
}

export function forumBoardAccessQueryKey(boardUri: string, did?: string | null) {
  return ['forum-board-access', boardUri, did ?? 'signed-out'] as const
}

export function cacheForumBoardEntitlement(
  queryClient: ReturnType<typeof useQueryClient>,
  boardUri: string,
  did: string,
  entitlement: ForumBoardEntitlement,
) {
  queryClient.setQueryData(forumBoardAccessQueryKey(boardUri, did), entitlement)
}

export function useForumBoardAccess(input: {
  boardUri: string
  boardRecord?: CreatonForumBoardRecord
}) {
  const { agent } = useAuth()
  const { data: abstractClient } = useAbstractClient()
  const access = input.boardRecord?.access
  const requiresEntitlement =
    input.boardRecord?.postingMode === 'encrypted' || input.boardRecord?.postingMode === 'mixed'

  return useQuery({
    queryKey: forumBoardAccessQueryKey(input.boardUri, agent?.did),
    queryFn: async (): Promise<ForumBoardEntitlement | null> => {
      if (!requiresEntitlement || !access) return null
      if (!agent?.did || !abstractClient) return null
      if (!isProductionForumCrypto()) {
        return {
          validFrom: new Date(0).toISOString(),
          validUntil: new Date(Date.now() + 86_400_000).toISOString(),
          paymentRef: null,
        }
      }
      const session = await loadForumAccessSession({
        did: agent.did,
        boardUri: input.boardUri,
        account: abstractClient.account.address,
        issuer: access.issuerDid,
      })
      if (!session) return null
      return {
        validFrom: new Date(session.issuedAt).toISOString(),
        validUntil: new Date(session.expiresAt).toISOString(),
        paymentRef: null,
      }
    },
    enabled: !!input.boardUri && (!requiresEntitlement || !!access),
    staleTime: 30_000,
  })
}

export function hasActiveForumEntitlement(
  entitlement: ForumBoardEntitlement | null | undefined,
  access?: CreatonForumAccessPolicy,
): boolean {
  if (!access) return true
  if (!entitlement) return false
  const now = Date.now()
  const validFrom = Date.parse(entitlement.validFrom)
  const validUntil = Date.parse(entitlement.validUntil)
  return now >= validFrom && now < validUntil
}

export function useCanAccessForumBoard(input: {
  boardUri: string
  boardRecord?: CreatonForumBoardRecord
}) {
  const accessQuery = useForumBoardAccess(input)
  const access = input.boardRecord?.access
  const requiresEntitlement =
    input.boardRecord?.postingMode === 'encrypted' || input.boardRecord?.postingMode === 'mixed'

  if (!requiresEntitlement || !access) {
    return { hasAccess: true, isLoading: false, accessQuery }
  }

  return {
    hasAccess: hasActiveForumEntitlement(accessQuery.data, access),
    isLoading: accessQuery.isLoading,
    accessQuery,
  }
}
