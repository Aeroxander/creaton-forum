import { useQuery } from '@tanstack/react-query'
import {
  decryptForumContent,
  type CreatonForumAccessPolicy,
  type CreatonForumEncryptedContentV3,
} from '@creaton/forum-core'

import { isInsufficientUsdcError } from '~/features/forums/crypto/forumBoardPayment'
import { isProductionForumCrypto } from '~/features/forums/crypto/forumCryptoMode'
import { useForumUnlock } from '~/features/forums/useForumUnlock'
import { useForumConfig } from '~/features/forums/useForumQueries'
import { getForumKeyCapsule } from '@creaton/forum-core'

export type ForumDecryptionErrorKind = 'subscribe' | 'funding' | 'generic'

export function classifyForumDecryptionError(message: string): ForumDecryptionErrorKind {
  if (/402|payment|required|entitlement|subscribe/i.test(message)) return 'subscribe'
  if (isInsufficientUsdcError(message)) return 'funding'
  return 'generic'
}

export function useDecryptedForumBody(input: {
  protectedBody: CreatonForumEncryptedContentV3 | undefined
  boardUri?: string
  recordUri?: string
  recordType?: 'topic' | 'comment'
  access?: CreatonForumAccessPolicy
  participantIds?: string[]
  hasBoardAccess?: boolean
  enabled?: boolean
}) {
  const { slingshoturl } = useForumConfig()
  const { unlock, isProduction } = useForumUnlock(input.boardUri ?? '')

  const isMpp = isProduction && input.access?.paymentProtocol === 'mpp'
  const productionEnabled =
    isProduction &&
    !isMpp &&
    !!input.protectedBody &&
    !!input.boardUri &&
    !!input.recordUri &&
    !!input.access &&
    (input.access.paymentProtocol !== 'tempo' || input.hasBoardAccess !== false)

  const devEnabled =
    !isProduction &&
    !!input.protectedBody?.keyCapsuleUri &&
    !!input.participantIds &&
    input.participantIds.length > 0

  const queryEnabled =
    (input.enabled ?? (productionEnabled || devEnabled)) && !!input.protectedBody

  return useQuery({
    queryKey: [
      '__volatile',
      'forum-decrypt',
      isProduction ? 'production' : 'dev',
      input.protectedBody?.keyCapsuleUri,
      input.boardUri,
      input.recordUri,
      input.participantIds?.join(','),
      slingshoturl,
    ],
    queryFn: async () => {
      const protectedBody = input.protectedBody
      if (!protectedBody) return undefined

      if (isProduction) {
        if (!input.boardUri || !input.recordUri || !input.access) {
          throw new Error('Board access context is required to decrypt encrypted posts.')
        }
        return unlock({
          boardUri: input.boardUri,
          recordUri: input.recordUri,
          recordType: input.recordType ?? 'topic',
          protectedBody,
          access: input.access,
        })
      }

      if (!input.participantIds || input.participantIds.length === 0) {
        throw new Error('No decryption participants available.')
      }
      if (!protectedBody.keyCapsuleUri) return undefined
      const capsule = await getForumKeyCapsule({
        uri: protectedBody.keyCapsuleUri,
        slingshoturl,
      })
      if (!capsule) return undefined
      return decryptForumContent({
        protectedBody,
        keyCapsule: capsule.value,
        participantIds: input.participantIds,
      })
    },
    enabled: queryEnabled,
    staleTime: 5 * 60 * 1000,
    retry: (count, error) => {
      const message = error instanceof Error ? error.message : ''
      if (classifyForumDecryptionError(message) === 'subscribe') return false
      return count < 1
    },
  })
}
