import type { ForumKeyCapsule } from '~/features/forums/crypto/forumKeyCapsule'
import {
  base64UrlToBytes,
  canonicalBytes,
  openSarmaV2,
  type SarmaV2Envelope,
} from '~/features/forums/crypto/sarmaV2'

export const FORUM_THRESHOLD_SUITE = 'BLS12-381-THRESHOLD-KEM-HPKE-P256' as const
export const FORUM_COMMITTEE_SIZE = 15
export const FORUM_COMMITTEE_THRESHOLD = 10

export type ForumKeyReleaseRequest = {
  boardUri: string
  capsules: ForumRequestedCapsule[]
  committeeEpoch: number
  eligibilityBlock: string
  certificate: Record<string, unknown>
}

export type ForumRequestedCapsule = { uri: string; value: ForumKeyCapsule }

export type ForumAccessReceipt = {
  requestId: string
  requestHash: string
  boardUri: string
  subjectHash: string
  committeeEpoch: number
  eligibilityBlock: string
  policyHash: string
  expiresAt: string
}

export type EncryptedForumPartialShare = {
  version: 1
  suite: typeof FORUM_THRESHOLD_SUITE
  requestHash: string
  committeeEpoch: number
  operatorId: string
  shareIndex: number
  recipientKeyHash: string
  envelope: SarmaV2Envelope
  shareProof: string
  operatorSignature: string
}

export type VerifiedForumPartialShare = {
  operatorId: string
  shareIndex: number
  partialShare: Uint8Array
}

export type ForumThresholdCrypto = {
  verifyPartialShare(input: {
    receipt: ForumAccessReceipt
    operatorId: string
    shareIndex: number
    partialShare: Uint8Array
    shareProof: string
    operatorSignature: string
    capsules: ForumRequestedCapsule[]
  }): Promise<boolean>
  combinePartialShares(input: {
    receipt: ForumAccessReceipt
    shares: VerifiedForumPartialShare[]
    capsules: ForumRequestedCapsule[]
  }): Promise<Uint8Array>
}

export async function reconstructForumEpochBundle(input: {
  receipt: ForumAccessReceipt
  shares: EncryptedForumPartialShare[]
  sessionPrivateKey: CryptoKey
  sessionKeyHash: string
  crypto: ForumThresholdCrypto
  capsules: ForumRequestedCapsule[]
  threshold?: number
}): Promise<Uint8Array> {
  const threshold = input.threshold ?? FORUM_COMMITTEE_THRESHOLD
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > FORUM_COMMITTEE_SIZE) {
    throw new Error('Invalid forum committee threshold.')
  }

  const verified: VerifiedForumPartialShare[] = []
  const operators = new Set<string>()
  const indices = new Set<number>()
  for (const share of input.shares) {
    assertShareMatchesReceipt(share, input.receipt, input.sessionKeyHash)
    if (operators.has(share.operatorId) || indices.has(share.shareIndex)) continue

    const partialShare = await openSarmaV2({
      privateKey: input.sessionPrivateKey,
      envelope: share.envelope,
      aad: shareAad(share),
    })
    const valid = await input.crypto.verifyPartialShare({
      receipt: input.receipt,
      operatorId: share.operatorId,
      shareIndex: share.shareIndex,
      partialShare,
      shareProof: share.shareProof,
      operatorSignature: share.operatorSignature,
      capsules: input.capsules,
    })
    if (!valid) continue

    operators.add(share.operatorId)
    indices.add(share.shareIndex)
    verified.push({ operatorId: share.operatorId, shareIndex: share.shareIndex, partialShare })
    if (verified.length === threshold) break
  }

  if (verified.length < threshold) {
    throw new Error(`Forum key release requires ${threshold} distinct valid committee shares.`)
  }
  return input.crypto.combinePartialShares({
    receipt: input.receipt,
    shares: verified,
    capsules: input.capsules,
  })
}

export function shareAad(
  share: Pick<
    EncryptedForumPartialShare,
    | 'version'
    | 'suite'
    | 'requestHash'
    | 'committeeEpoch'
    | 'operatorId'
    | 'shareIndex'
    | 'recipientKeyHash'
  >,
): Uint8Array {
  const {
    version,
    suite,
    requestHash,
    committeeEpoch,
    operatorId,
    shareIndex,
    recipientKeyHash,
  } = share
  return canonicalBytes({
    application: 'app.creaton.forum',
    purpose: 'threshold-partial-share',
    version,
    suite,
    requestHash,
    committeeEpoch,
    operatorId,
    shareIndex,
    recipientKeyHash,
  })
}

function assertShareMatchesReceipt(
  share: EncryptedForumPartialShare,
  receipt: ForumAccessReceipt,
  sessionKeyHash: string,
): void {
  if (share.version !== 1 || share.suite !== FORUM_THRESHOLD_SUITE) {
    throw new Error('Unsupported forum threshold-share format.')
  }
  if (
    share.requestHash !== receipt.requestHash ||
    share.committeeEpoch !== receipt.committeeEpoch ||
    share.recipientKeyHash !== sessionKeyHash
  ) {
    throw new Error('Forum threshold share is not bound to this access request.')
  }
  if (
    !Number.isInteger(share.shareIndex) ||
    share.shareIndex < 1 ||
    share.shareIndex > FORUM_COMMITTEE_SIZE
  ) {
    throw new Error('Forum threshold share has an invalid committee index.')
  }
  base64UrlToBytes(share.shareProof)
  base64UrlToBytes(share.operatorSignature)
}
