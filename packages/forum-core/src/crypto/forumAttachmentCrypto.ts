import type { CreatonForumEncryptedAttachment } from '../forumTypes'
import { bytesToBase64Url, currentForumKeyEpoch } from '../crypto/forumContentCrypto'
import type { LogosStorageClient } from '../storage/logosStorageClient'

const ATTACHMENT_SUITE = 'AES-256-GCM+HKDF-SHA256/AES-256-GCM' as const

function toBufferSource(data: Uint8Array): BufferSource {
  return data as unknown as BufferSource
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', toBufferSource(bytes)))
}

async function deriveWrappedFileKey(
  boardEpochKey: Uint8Array,
  keyEpochUri: string,
  keyNonce: Uint8Array,
): Promise<CryptoKey> {
  const ikm = await crypto.subtle.importKey('raw', toBufferSource(boardEpochKey), 'HKDF', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toBufferSource(keyNonce),
      info: new TextEncoder().encode(`app.creaton.forum.attachment-key.v1\n${keyEpochUri}`),
    },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptForumAttachment(input: {
  file: File
  boardEpochKey: Uint8Array
  keyEpochUri: string
  logosClient: LogosStorageClient
  epoch?: string
}): Promise<CreatonForumEncryptedAttachment> {
  const plaintext = new Uint8Array(await input.file.arrayBuffer())
  const ciphertextHash = await sha256(plaintext)
  const fileKey = crypto.getRandomValues(new Uint8Array(32))
  const fileNonce = crypto.getRandomValues(new Uint8Array(12))
  const keyNonce = crypto.getRandomValues(new Uint8Array(12))

  const aesKey = await crypto.subtle.importKey('raw', toBufferSource(fileKey), 'AES-GCM', false, [
    'encrypt',
  ])
  const encryptedFile = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toBufferSource(fileNonce) },
    aesKey,
    toBufferSource(plaintext),
  )

  const upload = await input.logosClient.uploadEncryptedBlob(new Uint8Array(encryptedFile))
  const wrapKey = await deriveWrappedFileKey(input.boardEpochKey, input.keyEpochUri, keyNonce)
  const wrappedFileKey = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toBufferSource(keyNonce) },
    wrapKey,
    toBufferSource(fileKey),
  )

  return {
    version: 1,
    suite: ATTACHMENT_SUITE,
    epoch: input.epoch ?? currentForumKeyEpoch(new Date()),
    keyEpochUri: input.keyEpochUri,
    manifestUri: upload.manifestUri,
    ciphertextHash: { $bytes: bytesToBase64Url(ciphertextHash) },
    size: plaintext.byteLength,
    mediaType: input.file.type || undefined,
    name: input.file.name || undefined,
    fileNonce: { $bytes: bytesToBase64Url(fileNonce) },
    keyNonce: { $bytes: bytesToBase64Url(keyNonce) },
    wrappedFileKey: { $bytes: bytesToBase64Url(new Uint8Array(wrappedFileKey)) },
  }
}

export async function decryptForumAttachment(input: {
  attachment: CreatonForumEncryptedAttachment
  boardEpochKey: Uint8Array
  logosClient: LogosStorageClient
}): Promise<{ bytes: Uint8Array; mediaType?: string; name?: string }> {
  const fileNonce = base64UrlToBytes(input.attachment.fileNonce.$bytes)
  const keyNonce = base64UrlToBytes(input.attachment.keyNonce.$bytes)
  const wrappedFileKey = base64UrlToBytes(input.attachment.wrappedFileKey.$bytes)

  const wrapKey = await deriveWrappedFileKey(
    input.boardEpochKey,
    input.attachment.keyEpochUri,
    keyNonce,
  )
  const fileKeyBytes = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toBufferSource(keyNonce) },
      wrapKey,
      toBufferSource(wrappedFileKey),
    ),
  )
  const aesKey = await crypto.subtle.importKey(
    'raw',
    toBufferSource(fileKeyBytes),
    'AES-GCM',
    false,
    ['decrypt'],
  )

  const ciphertext = await input.logosClient.fetchEncryptedBlob(input.attachment.manifestUri)
  const plaintext = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toBufferSource(fileNonce) },
      aesKey,
      toBufferSource(ciphertext),
    ),
  )

  const hash = await sha256(plaintext)
  const expected = base64UrlToBytes(input.attachment.ciphertextHash.$bytes)
  if (bytesToBase64Url(hash) !== bytesToBase64Url(expected)) {
    throw new Error('Encrypted attachment hash mismatch.')
  }

  return {
    bytes: plaintext,
    mediaType: input.attachment.mediaType,
    name: input.attachment.name,
  }
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}
