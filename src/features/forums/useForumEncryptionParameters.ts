import { useQuery } from '@tanstack/react-query'

import {
  fetchForumEncryptionParameters,
  resolveForumAppviewUrl,
  type CreatonForumBoardRecord,
} from '@creaton/forum-core'

import { isProductionForumCrypto } from '~/features/forums/crypto/forumCryptoMode'

export function useForumEncryptionParameters(boardUri: string, boardRecord?: CreatonForumBoardRecord) {
  const encrypted = boardRecord?.postingMode === 'encrypted'

  return useQuery({
    queryKey: ['forum-encryption-params', boardUri],
    queryFn: async () => {
      const appviewUrl = await resolveForumAppviewUrl()
      return fetchForumEncryptionParameters(appviewUrl, boardUri)
    },
    enabled: encrypted && isProductionForumCrypto() && !!boardUri,
    staleTime: 5 * 60 * 1000,
  })
}
