import { bls12_381 } from '@noble/curves/bls12-381.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'

import { base64UrlToBytes, bytesToBase64Url } from '~/features/forums/crypto/sarmaV2'

const KEM_NAMESPACE = new TextEncoder().encode('app.creaton.forum.threshold-dh-kem.v1')

export const FORUM_KEY_CAPSULE_SUITE = 'BLS12-381-THRESHOLD-DH/HKDF-SHA256/AES-256-GCM' as const

export type ForumKeyCapsule = {
  version: 1
  suite: typeof FORUM_KEY_CAPSULE_SUITE
  boardUri: string
  recordUri: string
  committeeEpoch: number
  policyHash: string
  encapsulation: string
  nonce: string
  ciphertext: string
  keyCommitment: string
  createdAt: string
}

export async function createForumKeyCapsule(input: {
  contentKey: Uint8Array
  committeePublicKey: string
  boardUri: string
  recordUri: string
  capsuleUri: string
  committeeEpoch: number
  policyHash: string
  createdAt?: string
}): Promise<ForumKeyCapsule> {
  if (input.contentKey.length !== 32) throw new Error('Forum content keys must be 32 bytes.')
  const publicKey = bls12_381.G1.Point.fromHex(base64UrlToBytes(input.committeePublicKey))
  const secret = bytesToBigInt(bls12_381.utils.randomSecretKey())
  const encapsulation = bls12_381.G1.Point.BASE.multiply(secret)
  const shared = publicKey.multiply(secret)
  const context = forumCapsuleContext(input)
  const wrappingKey = hkdf(sha256, shared.toBytes(true), KEM_NAMESPACE, context, 32)
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const key = await crypto.subtle.importKey('raw', toArrayBuffer(wrappingKey), 'AES-GCM', false, [
    'encrypt',
  ])
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(nonce),
      additionalData: toArrayBuffer(context),
      tagLength: 128,
    },
    key,
    toArrayBuffer(input.contentKey),
  )
  return {
    version: 1,
    suite: FORUM_KEY_CAPSULE_SUITE,
    boardUri: input.boardUri,
    recordUri: input.recordUri,
    committeeEpoch: input.committeeEpoch,
    policyHash: input.policyHash,
    encapsulation: bytesToBase64Url(encapsulation.toBytes(true)),
    nonce: bytesToBase64Url(nonce),
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
    keyCommitment: bytesToBase64Url(sha256(input.contentKey)),
    createdAt: input.createdAt ?? new Date().toISOString(),
  }
}

export async function unwrapForumKeyCapsule(
  capsule: ForumKeyCapsule,
  capsuleUri: string,
  shared: Uint8Array,
): Promise<Uint8Array> {
  assertForumKeyCapsule(capsule)
  const context = forumCapsuleContext({ ...capsule, capsuleUri })
  const wrappingKey = hkdf(sha256, shared, KEM_NAMESPACE, context, 32)
  const key = await crypto.subtle.importKey('raw', toArrayBuffer(wrappingKey), 'AES-GCM', false, [
    'decrypt',
  ])
  const plaintext = new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(base64UrlToBytes(capsule.nonce)),
        additionalData: toArrayBuffer(context),
        tagLength: 128,
      },
      key,
      toArrayBuffer(base64UrlToBytes(capsule.ciphertext)),
    ),
  )
  if (plaintext.length !== 32 || bytesToBase64Url(sha256(plaintext)) !== capsule.keyCommitment) {
    throw new Error('Forum capsule key commitment mismatch.')
  }
  return plaintext
}

export function forumCapsuleContext(input: {
  committeeEpoch: number
  boardUri: string
  capsuleUri: string
  policyHash: string
}): Uint8Array {
  return new TextEncoder().encode(
    `${input.committeeEpoch}\n${input.boardUri}\n${input.capsuleUri}\n${input.policyHash}`,
  )
}

export function assertForumKeyCapsule(value: ForumKeyCapsule): void {
  if (
    value.version !== 1 ||
    value.suite !== FORUM_KEY_CAPSULE_SUITE ||
    !value.boardUri.startsWith('at://') ||
    !value.recordUri.startsWith('at://') ||
    !Number.isSafeInteger(value.committeeEpoch) ||
    value.committeeEpoch < 1 ||
    base64UrlToBytes(value.encapsulation).length !== 48 ||
    base64UrlToBytes(value.nonce).length !== 12 ||
    base64UrlToBytes(value.keyCommitment).length !== 32
  ) {
    throw new Error('Invalid forum threshold key capsule.')
  }
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  return BigInt(`0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`)
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}
