import { bls12_381 } from '@noble/curves/bls12-381.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'

import {
  decryptContentKey,
  encapsulateContentKey,
  type KeyCapsule,
} from './dkgServiceClient'
import type {
  CreatonForumEncryptedContentV3,
  CreatonForumKeyCapsuleRecord,
} from '../forumTypes'
import { canonicalBytes } from './sarmaV2'

export type EncryptedForumContent = {
  version: 3
  suite: 'BLS12-381-THRESHOLD-DH/HKDF-SHA256/AES-256-GCM' | 'HKDF-SHA256/AES-256-GCM'
  epoch: string
  salt: string | Uint8Array
  nonce: string | Uint8Array
  ciphertext: string | Uint8Array
  committeeEpoch: number
  keyCapsuleUri: string
}

export type ForumKeyCapsule = {
  version: 1
  suite: 'BLS12-381-THRESHOLD-DH/HKDF-SHA256/AES-256-GCM'
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

export type ForumContentContext = {
  boardUri: string
  recordUri: string
  recordType: 'topic' | 'comment'
  epoch: string
  committeeEpoch: number
  keyCapsuleUri: string
}

const DEV_SUITE = 'BLS12-381-THRESHOLD-DH/HKDF-SHA256/AES-256-GCM' as const
const PRODUCTION_SUITE = 'HKDF-SHA256/AES-256-GCM' as const
const KEM_NAMESPACE = new TextEncoder().encode('app.creaton.forum.threshold-dh-kem.v1')

export function getForumCryptoMode(): 'dev' | 'production' {
  const mode =
    typeof import.meta !== 'undefined' ? import.meta.env?.VITE_FORUM_CRYPTO_MODE : undefined
  return mode === 'production' ? 'production' : 'dev'
}

export function currentForumKeyEpoch(date: Date) {
  return date.toISOString().slice(0, 10)
}

export function generateForumEpochKey() {
  return crypto.getRandomValues(new Uint8Array(32))
}

export function base64UrlToBytes(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

export function bytesToBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function boardIdFromUri(boardUri: string): string {
  const match = boardUri.match(/^at:\/\/[^/]+\/[^/]+\/([^/]+)$/)
  if (match?.[1]) return match[1]
  return boardUri
}

function recordTypeFromUri(recordUri: string): 'topic' | 'comment' {
  const collection = recordUri.match(/\/([^/]+)\/[^/]+$/)?.[1]
  if (collection === 'app.creaton.forum.topic') return 'topic'
  if (collection === 'app.creaton.forum.comment') return 'comment'
  return 'topic'
}

function buildDevContentContext(params: {
  boardUri: string
  recordUri: string
  recordType?: string
  epoch: string
  committeeEpoch: number
  keyCapsuleUri: string
}): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      boardUri: params.boardUri,
      recordUri: params.recordUri,
      recordType: params.recordType ?? recordTypeFromUri(params.recordUri),
      epoch: params.epoch,
      committeeEpoch: params.committeeEpoch,
      keyCapsuleUri: params.keyCapsuleUri,
    }),
  )
}

function productionContentAad(context: ForumContentContext): Uint8Array {
  return canonicalBytes({
    application: 'app.creaton.forum',
    boardUri: context.boardUri,
    epoch: context.epoch,
    recordType: context.recordType,
    recordUri: context.recordUri,
    version: 3,
    committeeEpoch: context.committeeEpoch,
    keyCapsuleUri: context.keyCapsuleUri,
  })
}

function toBufferSource(data: Uint8Array): BufferSource {
  return data as unknown as BufferSource
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

async function deriveDevAesKey(
  epochKey: Uint8Array,
  salt: Uint8Array,
  contextBytes: Uint8Array,
): Promise<CryptoKey> {
  const ikm = await crypto.subtle.importKey('raw', toBufferSource(epochKey), 'HKDF', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toBufferSource(salt),
      info: toBufferSource(contextBytes),
    },
    ikm,
    256,
  )
  return crypto.subtle.importKey('raw', bits, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

async function deriveProductionContentKey(
  epochKey: Uint8Array,
  salt: Uint8Array,
  context: ForumContentContext,
): Promise<CryptoKey> {
  if (epochKey.byteLength !== 32) throw new Error('Forum epoch keys must be 32 bytes.')
  const sourceKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(epochKey),
    'HKDF',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toArrayBuffer(salt),
      info: toArrayBuffer(
        canonicalBytes({
          purpose: 'app.creaton.forum.content-key.v1',
          ...context,
          version: 3,
        }),
      ),
    },
    sourceKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptForumContent(input: {
  plaintext: string
  epochKey: Uint8Array
  context: {
    boardUri: string
    recordUri: string
    recordType?: string
    epoch: string
    committeeEpoch: number
    keyCapsuleUri: string
  }
}): Promise<EncryptedForumContent> {
  const salt = crypto.getRandomValues(new Uint8Array(32))
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const recordType = (input.context.recordType ?? recordTypeFromUri(input.context.recordUri)) as
    | 'topic'
    | 'comment'
  const production = getForumCryptoMode() === 'production'

  if (production) {
    const contentContext: ForumContentContext = {
      boardUri: input.context.boardUri,
      recordUri: input.context.recordUri,
      recordType,
      epoch: input.context.epoch,
      committeeEpoch: input.context.committeeEpoch,
      keyCapsuleUri: input.context.keyCapsuleUri,
    }
    const key = await deriveProductionContentKey(input.epochKey, salt, contentContext)
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(nonce),
        additionalData: toArrayBuffer(productionContentAad(contentContext)),
        tagLength: 128,
      },
      key,
      toArrayBuffer(new TextEncoder().encode(input.plaintext)),
    )
    return {
      version: 3,
      suite: PRODUCTION_SUITE,
      epoch: input.context.epoch,
      salt: bytesToBase64Url(salt),
      nonce: bytesToBase64Url(nonce),
      ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
      committeeEpoch: input.context.committeeEpoch,
      keyCapsuleUri: input.context.keyCapsuleUri,
    }
  }

  const contextBytes = buildDevContentContext(input.context)
  const key = await deriveDevAesKey(input.epochKey, salt, contextBytes)
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toBufferSource(nonce),
      additionalData: toBufferSource(contextBytes),
    },
    key,
    toBufferSource(new TextEncoder().encode(input.plaintext)),
  )
  return {
    version: 3,
    suite: DEV_SUITE,
    epoch: input.context.epoch,
    salt: bytesToBase64Url(salt),
    nonce: bytesToBase64Url(nonce),
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
    committeeEpoch: input.context.committeeEpoch,
    keyCapsuleUri: input.context.keyCapsuleUri,
  }
}

export async function decryptForumContentWithEpochKey(input: {
  encrypted: EncryptedForumContent
  epochKey: Uint8Array
  context: ForumContentContext
}): Promise<string> {
  const salt = base64UrlToBytes(
    typeof input.encrypted.salt === 'string' ? input.encrypted.salt : input.encrypted.salt,
  )
  const nonce = base64UrlToBytes(
    typeof input.encrypted.nonce === 'string' ? input.encrypted.nonce : input.encrypted.nonce,
  )
  const ciphertext = base64UrlToBytes(
    typeof input.encrypted.ciphertext === 'string'
      ? input.encrypted.ciphertext
      : input.encrypted.ciphertext,
  )

  if (input.encrypted.suite === PRODUCTION_SUITE) {
    const key = await deriveProductionContentKey(input.epochKey, salt, input.context)
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(nonce),
        additionalData: toArrayBuffer(productionContentAad(input.context)),
        tagLength: 128,
      },
      key,
      toArrayBuffer(ciphertext),
    )
    return new TextDecoder().decode(plaintext)
  }

  const contextBytes = buildDevContentContext(input.context)
  const key = await deriveDevAesKey(input.epochKey, salt, contextBytes)
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toBufferSource(nonce),
      additionalData: toBufferSource(contextBytes),
    },
    key,
    toBufferSource(ciphertext),
  )
  return new TextDecoder().decode(plaintext)
}

export async function decryptForumContent(input: {
  protectedBody: CreatonForumEncryptedContentV3
  keyCapsule: CreatonForumKeyCapsuleRecord
  participantIds: string[]
}): Promise<string> {
  const boardId = boardIdFromUri(input.keyCapsule.board.uri)
  const capsule: KeyCapsule = {
    encapsulation: input.keyCapsule.encapsulation.$bytes,
    nonce: input.keyCapsule.nonce.$bytes,
    ciphertext: input.keyCapsule.ciphertext.$bytes,
    keyCommitment: input.keyCapsule.keyCommitment.$bytes,
  }
  const contentKey = await decryptContentKey(boardId, capsule, input.participantIds)

  const encrypted: EncryptedForumContent = {
    version: 3,
    suite: DEV_SUITE,
    epoch: input.protectedBody.epoch,
    salt: bytesFieldToString(input.protectedBody.salt),
    nonce: bytesFieldToString(input.protectedBody.nonce),
    ciphertext: bytesFieldToString(input.protectedBody.ciphertext),
    committeeEpoch: input.protectedBody.committeeEpoch,
    keyCapsuleUri: input.protectedBody.keyCapsuleUri,
  }
  return decryptForumContentWithEpochKey({
    encrypted,
    epochKey: contentKey,
    context: {
      boardUri: input.keyCapsule.board.uri,
      recordUri: input.keyCapsule.recordUri,
      recordType: recordTypeFromUri(input.keyCapsule.recordUri),
      epoch: input.protectedBody.epoch,
      committeeEpoch: input.protectedBody.committeeEpoch,
      keyCapsuleUri: input.protectedBody.keyCapsuleUri,
    },
  })
}

function bytesFieldToString(value: string | { $bytes: string }): string {
  return typeof value === 'string' ? value : value.$bytes
}

function forumCapsuleContext(input: {
  committeeEpoch: number
  boardUri: string
  capsuleUri: string
  policyHash: string
}): Uint8Array {
  return new TextEncoder().encode(
    `${input.committeeEpoch}\n${input.boardUri}\n${input.capsuleUri}\n${input.policyHash}`,
  )
}

async function createProductionForumKeyCapsule(input: {
  contentKey: Uint8Array
  committeePublicKey: string
  boardUri: string
  recordUri: string
  capsuleUri: string
  committeeEpoch: number
  policyHash: string
  createdAt: string
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
    suite: DEV_SUITE,
    boardUri: input.boardUri,
    recordUri: input.recordUri,
    committeeEpoch: input.committeeEpoch,
    policyHash: input.policyHash,
    encapsulation: bytesToBase64Url(encapsulation.toBytes(true)),
    nonce: bytesToBase64Url(nonce),
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
    keyCommitment: bytesToBase64Url(sha256(input.contentKey)),
    createdAt: input.createdAt,
  }
}

export async function createForumKeyCapsule(input: {
  contentKey: Uint8Array
  boardUri: string
  recordUri: string
  capsuleUri: string
  committeeEpoch: number
  policyHash: string
  createdAt: string
  committeePublicKey?: string
}): Promise<ForumKeyCapsule> {
  if (input.committeePublicKey) {
    return createProductionForumKeyCapsule({
      contentKey: input.contentKey,
      committeePublicKey: input.committeePublicKey,
      boardUri: input.boardUri,
      recordUri: input.recordUri,
      capsuleUri: input.capsuleUri,
      committeeEpoch: input.committeeEpoch,
      policyHash: input.policyHash,
      createdAt: input.createdAt,
    })
  }

  const boardId = boardIdFromUri(input.boardUri)
  const capsule = await encapsulateContentKey(boardId, input.contentKey)
  return {
    version: 1,
    suite: DEV_SUITE,
    boardUri: input.boardUri,
    recordUri: input.recordUri,
    committeeEpoch: input.committeeEpoch,
    policyHash: input.policyHash,
    encapsulation: capsule.encapsulation,
    nonce: capsule.nonce,
    ciphertext: capsule.ciphertext,
    keyCommitment: capsule.keyCommitment,
    createdAt: input.createdAt,
  }
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  return BigInt(`0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`)
}
