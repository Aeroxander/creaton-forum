import { bls12_381 } from '@noble/curves/bls12-381.js'

import {
  forumCapsuleContext,
  unwrapForumKeyCapsule,
} from '~/features/forums/crypto/forumKeyCapsule'
import type {
  ForumRequestedCapsule,
  ForumThresholdCrypto,
} from '~/features/forums/crypto/forumThresholdAccess'
import { base64UrlToBytes, bytesToBase64Url } from '~/features/forums/crypto/sarmaV2'

const PROOF_DST = 'app.creaton.forum.threshold-dh-proof.v1'
const SCALAR_ORDER = bls12_381.fields.Fr.ORDER

type CapsulePartial = {
  uri: string
  value: string
  commitmentG: string
  commitmentU: string
  response: string
}
type PartialBundle = { version: 1; committeeEpoch: number; capsules: CapsulePartial[] }

export type ForumCapsuleKeyBundle = {
  version: 1
  committeeEpoch: number
  keys: Array<{ capsuleUri: string; key: string }>
}

export const commonwareThresholdCrypto: ForumThresholdCrypto = {
  async verifyPartialShare(input) {
    try {
      const bundle = decodeBundle(input.partialShare)
      if (bundle.committeeEpoch !== input.receipt.committeeEpoch || bundle.capsules.length === 0)
        return false
      const verificationShare = bls12_381.G1.Point.fromHex(base64UrlToBytes(input.shareProof))
      if (base64UrlToBytes(input.operatorSignature).length === 0) return false
      const capsules = new Map(input.capsules.map((capsule) => [capsule.uri, capsule]))
      return bundle.capsules.every((partial) => {
        const capsule = capsules.get(partial.uri)
        if (!capsule) return false
        return verifyDleq(
          capsule,
          verificationShare,
          partial,
          input.receipt.committeeEpoch,
          input.receipt.boardUri,
          input.receipt.policyHash,
        )
      })
    } catch {
      return false
    }
  },

  async combinePartialShares({ receipt, shares, capsules }) {
    const bundles = shares.map(({ partialShare, shareIndex }) => ({
      shareIndex,
      bundle: decodeBundle(partialShare),
    }))
    const keys = await Promise.all(
      capsules.map(async (capsule) => {
        const evaluations = bundles.map(({ shareIndex, bundle }) => {
          const partial = bundle.capsules.find((item) => item.uri === capsule.uri)
          if (!partial) throw new Error('Committee response omitted a requested capsule.')
          return {
            shareIndex,
            point: bls12_381.G1.Point.fromHex(base64UrlToBytes(partial.value)),
          }
        })
        const shared = interpolateAtZero(evaluations).toBytes(true)
        const key = await unwrapForumKeyCapsule(capsule.value, capsule.uri, shared)
        return { capsuleUri: capsule.uri, key: bytesToBase64Url(key) }
      }),
    )
    return new TextEncoder().encode(
      JSON.stringify({
        version: 1,
        committeeEpoch: receipt.committeeEpoch,
        keys,
      } satisfies ForumCapsuleKeyBundle),
    )
  },
}

export function decodeForumCapsuleKeyBundle(value: Uint8Array): ForumCapsuleKeyBundle {
  const parsed = JSON.parse(new TextDecoder().decode(value)) as ForumCapsuleKeyBundle
  if (parsed.version !== 1 || !Array.isArray(parsed.keys))
    throw new Error('Invalid forum capsule-key bundle.')
  for (const entry of parsed.keys) {
    if (!entry.capsuleUri.startsWith('at://') || base64UrlToBytes(entry.key).length !== 32) {
      throw new Error('Invalid forum capsule key.')
    }
  }
  return parsed
}

function verifyDleq(
  capsule: ForumRequestedCapsule,
  verificationShare: typeof bls12_381.G1.Point.BASE,
  partial: CapsulePartial,
  committeeEpoch: number,
  boardUri: string,
  policyHash: string,
): boolean {
  const u = bls12_381.G1.Point.fromHex(base64UrlToBytes(capsule.value.encapsulation))
  const value = bls12_381.G1.Point.fromHex(base64UrlToBytes(partial.value))
  const commitmentG = bls12_381.G1.Point.fromHex(base64UrlToBytes(partial.commitmentG))
  const commitmentU = bls12_381.G1.Point.fromHex(base64UrlToBytes(partial.commitmentU))
  const response = bytesToBigInt(base64UrlToBytes(partial.response))
  if (response <= 0n || response >= SCALAR_ORDER) return false
  const context = forumCapsuleContext({
    committeeEpoch,
    boardUri,
    capsuleUri: capsule.uri,
    policyHash,
  })
  const challenge = bls12_381.G1.hashToScalar(
    proofTranscript(context, u, verificationShare, value, commitmentG, commitmentU),
    { DST: PROOF_DST },
  )
  return (
    bls12_381.G1.Point.BASE.multiply(response).equals(
      commitmentG.add(verificationShare.multiply(challenge)),
    ) &&
    u.multiply(response).equals(commitmentU.add(value.multiply(challenge)))
  )
}

function proofTranscript(
  context: Uint8Array,
  ...points: Array<typeof bls12_381.G1.Point.BASE>
): Uint8Array {
  const length = new Uint8Array(8)
  new DataView(length.buffer).setBigUint64(0, BigInt(context.length))
  const result = new Uint8Array(8 + context.length + points.length * 48)
  result.set(length)
  result.set(context, 8)
  points.forEach((point, index) => result.set(point.toBytes(true), 8 + context.length + index * 48))
  return result
}

function decodeBundle(value: Uint8Array): PartialBundle {
  const parsed = JSON.parse(new TextDecoder().decode(value)) as PartialBundle
  if (
    parsed.version !== 1 ||
    !Number.isSafeInteger(parsed.committeeEpoch) ||
    !Array.isArray(parsed.capsules)
  ) {
    throw new Error('Invalid committee partial bundle.')
  }
  return parsed
}

function interpolateAtZero(
  evaluations: Array<{
    shareIndex: number
    point: typeof bls12_381.G1.Point.BASE
  }>,
): typeof bls12_381.G1.Point.BASE {
  let recovered = bls12_381.G1.Point.ZERO
  for (const evaluation of evaluations) {
    const x = BigInt(evaluation.shareIndex)
    let numerator = 1n
    let denominator = 1n
    for (const other of evaluations) {
      if (other.shareIndex === evaluation.shareIndex) continue
      const y = BigInt(other.shareIndex)
      numerator = mod(numerator * -y)
      denominator = mod(denominator * (x - y))
    }
    recovered = recovered.add(evaluation.point.multiply(mod(numerator * invert(denominator))))
  }
  return recovered
}

function invert(value: bigint): bigint {
  let base = mod(value)
  let exponent = SCALAR_ORDER - 2n
  let result = 1n
  while (exponent > 0n) {
    if (exponent & 1n) result = mod(result * base)
    base = mod(base * base)
    exponent >>= 1n
  }
  return result
}

function mod(value: bigint): bigint {
  const result = value % SCALAR_ORDER
  return result >= 0n ? result : result + SCALAR_ORDER
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  return BigInt(`0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`)
}
