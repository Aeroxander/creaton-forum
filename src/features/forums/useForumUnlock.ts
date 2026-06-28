import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef } from 'react'
import { usePublicClient, useWalletClient } from 'wagmi'

import {
  decryptForumContentWithEpochKey,
  encryptedForumContentFromRecord,
  forumKeyCapsuleFromRecord,
  getForumKeyCapsule,
  type CreatonForumAccessPolicy,
  type CreatonForumEncryptedContentV3,
} from '@creaton/forum-core'

import { requestForumKeyRelease, createSignedForumAccessSession } from '~/features/forums/crypto/forumAccessClient'
import { loadForumAccessSession } from '~/features/forums/crypto/forumAccessSession'
import {
  commonwareThresholdCrypto,
  decodeForumCapsuleKeyBundle,
} from '~/features/forums/crypto/commonwareThresholdCrypto'
import { reconstructForumEpochBundle } from '~/features/forums/crypto/forumThresholdAccess'
import { base64UrlToBytes } from '~/features/forums/crypto/sarmaV2'
import { isProductionForumCrypto } from '~/features/forums/crypto/forumCryptoMode'
import { forumBoardAccessQueryKey } from '~/features/forums/useForumBoardAccess'
import { useForumConfig } from '~/features/forums/useForumQueries'
import { useAuth } from '~/providers/UnifiedAuthProvider'

type UnlockInput = {
  boardUri: string
  recordUri: string
  recordType: 'topic' | 'comment'
  protectedBody: CreatonForumEncryptedContentV3
  access: CreatonForumAccessPolicy
}

type CachedEpochKey = {
  capsuleUri: string
  epochKey: Uint8Array
}

export function useForumUnlock(boardUri: string) {
  const { agent } = useAuth()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()
  const { slingshoturl } = useForumConfig()
  const queryClient = useQueryClient()
  const epochKeyCache = useRef(new Map<string, CachedEpochKey>())

  const unlockEpochKey = useCallback(
    async (input: UnlockInput): Promise<Uint8Array> => {
      const encrypted = encryptedForumContentFromRecord(input.protectedBody)
      const cacheKey = `${input.boardUri}:${encrypted.keyCapsuleUri}`
      const cached = epochKeyCache.current.get(cacheKey)
      if (cached) return cached.epochKey

      if (!agent?.did || !walletClient?.account) {
        throw new Error('Sign in and connect your Tempo wallet before unlocking encrypted posts.')
      }
      const account = walletClient.account.address

      const capsuleRecord = await getForumKeyCapsule({
        uri: encrypted.keyCapsuleUri,
        slingshoturl,
      })
      if (!capsuleRecord) {
        throw new Error('Key capsule not found.')
      }
      const capsule = forumKeyCapsuleFromRecord(capsuleRecord.uri, capsuleRecord.value)

      let session = await loadForumAccessSession({
        did: agent.did,
        boardUri: input.boardUri,
        account,
        issuer: input.access.issuerDid,
      })
      if (!session) {
        session = await createSignedForumAccessSession({
          agent,
          walletClient,
          boardUri: input.boardUri,
          issuerDid: input.access.issuerDid,
          chainId: input.access.chainId,
        })
      }

      const eligibilityBlock = BigInt(await publicClient!.getBlockNumber())

      const release = await requestForumKeyRelease({
        agent,
        walletClient,
        issuerEndpoint: input.access.issuerEndpoint,
        issuerDid: input.access.issuerDid,
        boardUri: input.boardUri,
        session,
        capsules: [{ uri: capsuleRecord.uri, value: capsule }],
        committeeEpoch: capsule.committeeEpoch,
        eligibilityBlock,
      })

      const combined = await reconstructForumEpochBundle({
        receipt: release.receipt,
        shares: release.shares,
        sessionPrivateKey: session.privateKey,
        sessionKeyHash: session.sessionKeyHash,
        crypto: commonwareThresholdCrypto,
        capsules: [{ uri: capsuleRecord.uri, value: capsule }],
      })

      const keyBundle = decodeForumCapsuleKeyBundle(combined)
      const keyEntry = keyBundle.keys.find((item) => item.capsuleUri === capsuleRecord.uri)?.key
      if (!keyEntry) throw new Error('The committee response did not include this post key.')

      const epochKey = base64UrlToBytes(keyEntry)
      epochKeyCache.current.set(cacheKey, { capsuleUri: encrypted.keyCapsuleUri, epochKey })
      void queryClient.invalidateQueries({
        queryKey: forumBoardAccessQueryKey(input.boardUri, agent.did),
      })
      return epochKey
    },
    [agent, publicClient, queryClient, slingshoturl, walletClient],
  )

  const unlockMutation = useMutation({
    mutationFn: async (input: UnlockInput) => {
      const encrypted = encryptedForumContentFromRecord(input.protectedBody)
      const epochKey = await unlockEpochKey(input)
      return decryptForumContentWithEpochKey({
        encrypted,
        epochKey,
        context: {
          boardUri: input.boardUri,
          recordUri: input.recordUri,
          recordType: input.recordType,
          epoch: encrypted.epoch,
          committeeEpoch: encrypted.committeeEpoch,
          keyCapsuleUri: encrypted.keyCapsuleUri,
        },
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['__volatile', 'forum-decrypt'] })
    },
  })

  const clearCache = useCallback(() => {
    epochKeyCache.current.clear()
  }, [])

  return {
    unlock: unlockMutation.mutateAsync,
    getEpochKey: unlockEpochKey,
    unlockMutation,
    clearCache,
    isProduction: isProductionForumCrypto(),
  }
}
