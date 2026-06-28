import { del, get, set } from 'idb-keyval'
import type { Address, Hex } from 'viem'

import {
  base64UrlToBytes,
  bytesToBase64Url,
  generateSarmaSessionKeyPair,
} from '~/features/forums/crypto/sarmaV2'

export const FORUM_ACCESS_SESSION_VERSION = '1' as const
export const FORUM_ACCESS_SESSION_TTL_MS = 24 * 60 * 60 * 1000
const STORAGE_PREFIX = 'creaton-forum-access-session:v1:'

export const FORUM_ACCESS_SESSION_TYPES = {
  ForumAccessSession: [
    { name: 'did', type: 'string' },
    { name: 'account', type: 'address' },
    { name: 'boardUri', type: 'string' },
    { name: 'issuer', type: 'string' },
    { name: 'sessionKey', type: 'bytes' },
    { name: 'sessionKeyHash', type: 'string' },
    { name: 'nonce', type: 'bytes32' },
    { name: 'issuedAt', type: 'uint64' },
    { name: 'expiresAt', type: 'uint64' },
  ],
} as const

export type ForumAccessSession = {
  version: typeof FORUM_ACCESS_SESSION_VERSION
  did: string
  account: Address
  boardUri: string
  issuer: string
  publicKey: string
  sessionKeyHash: string
  nonce: Hex
  issuedAt: number
  expiresAt: number
  privateKey: CryptoKey
  signature?: Hex
}

export async function createForumAccessSession(input: {
  did: string
  account: Address
  boardUri: string
  issuer: string
  entitlementExpiresAt?: number
  now?: number
}): Promise<ForumAccessSession> {
  const issuedAt = input.now ?? Date.now()
  const expiresAt = Math.min(
    issuedAt + FORUM_ACCESS_SESSION_TTL_MS,
    input.entitlementExpiresAt ?? Number.POSITIVE_INFINITY,
  )
  if (expiresAt <= issuedAt) throw new Error('The forum entitlement has expired.')

  const keyPair = await generateSarmaSessionKeyPair()
  return {
    version: FORUM_ACCESS_SESSION_VERSION,
    did: input.did,
    account: input.account,
    boardUri: input.boardUri,
    issuer: input.issuer,
    publicKey: bytesToBase64Url(keyPair.publicKeyBytes),
    sessionKeyHash: keyPair.fingerprint,
    nonce: randomHex32(),
    issuedAt,
    expiresAt,
    privateKey: keyPair.privateKey,
  }
}

export function forumAccessSessionTypedData(session: ForumAccessSession, chainId = 2741) {
  return {
    domain: {
      name: 'Creaton Forum Access',
      version: FORUM_ACCESS_SESSION_VERSION,
      chainId,
    },
    types: FORUM_ACCESS_SESSION_TYPES,
    primaryType: 'ForumAccessSession' as const,
    message: {
      did: session.did,
      account: session.account,
      boardUri: session.boardUri,
      issuer: session.issuer,
      sessionKey: `0x${Array.from(base64UrlToBytes(session.publicKey), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('')}` as Hex,
      sessionKeyHash: session.sessionKeyHash,
      nonce: session.nonce,
      issuedAt: BigInt(Math.floor(session.issuedAt / 1000)),
      expiresAt: BigInt(Math.floor(session.expiresAt / 1000)),
    },
  }
}

export async function saveForumAccessSession(session: ForumAccessSession): Promise<void> {
  await set(storageKey(session.did, session.boardUri), session)
}

export async function loadForumAccessSession(input: {
  did: string
  boardUri: string
  account: Address
  issuer: string
  now?: number
}): Promise<ForumAccessSession | null> {
  const key = storageKey(input.did, input.boardUri)
  const session = await get<ForumAccessSession>(key)
  const now = input.now ?? Date.now()
  if (
    !session ||
    session.expiresAt <= now ||
    session.account.toLowerCase() !== input.account.toLowerCase() ||
    session.issuer !== input.issuer
  ) {
    if (session) await del(key)
    return null
  }
  return session
}

export async function deleteForumAccessSession(did: string, boardUri: string): Promise<void> {
  await del(storageKey(did, boardUri))
}

function storageKey(did: string, boardUri: string): string {
  return `${STORAGE_PREFIX}${did}:${boardUri}`
}

function randomHex32(): Hex {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}
