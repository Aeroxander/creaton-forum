import {
  Aes256Gcm,
  CipherSuite,
  DhkemP256HkdfSha256,
  HkdfSha256,
} from '@hpke/core'

export const SARMA_V2_VERSION = 2 as const
export const SARMA_V2_SUITE = 'DHKEM-P256-HKDF-SHA256/HKDF-SHA256/AES-256-GCM' as const

const INFO = new TextEncoder().encode('app.creaton.forum.sarma.v2')

export type SarmaV2Envelope = {
  version: typeof SARMA_V2_VERSION
  suite: typeof SARMA_V2_SUITE
  enc: string
  ciphertext: string
}

export type SarmaSessionKeyPair = {
  privateKey: CryptoKey
  publicKey: CryptoKey
  publicKeyBytes: Uint8Array
  fingerprint: string
}

export async function generateSarmaSessionKeyPair(): Promise<SarmaSessionKeyPair> {
  const suite = createSuite()
  const keyPair = await suite.kem.generateKeyPair()
  const publicKeyBytes = new Uint8Array(await suite.kem.serializePublicKey(keyPair.publicKey))

  return {
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
    publicKeyBytes,
    fingerprint: await sha256Base64Url(publicKeyBytes),
  }
}

export async function sealSarmaV2(input: {
  recipientPublicKey: Uint8Array
  plaintext: Uint8Array
  aad: Uint8Array
}): Promise<SarmaV2Envelope> {
  const suite = createSuite()
  const recipientPublicKey = await suite.kem.deserializePublicKey(input.recipientPublicKey)
  const sealed = await suite.seal(
    { recipientPublicKey, info: INFO },
    input.plaintext,
    input.aad,
  )

  return {
    version: SARMA_V2_VERSION,
    suite: SARMA_V2_SUITE,
    enc: bytesToBase64Url(new Uint8Array(sealed.enc)),
    ciphertext: bytesToBase64Url(new Uint8Array(sealed.ct)),
  }
}

export async function openSarmaV2(input: {
  privateKey: CryptoKey
  envelope: SarmaV2Envelope
  aad: Uint8Array
}): Promise<Uint8Array> {
  assertSarmaV2Envelope(input.envelope)
  const suite = createSuite()
  const plaintext = await suite.open(
    {
      recipientKey: input.privateKey,
      enc: base64UrlToBytes(input.envelope.enc),
      info: INFO,
    },
    base64UrlToBytes(input.envelope.ciphertext),
    input.aad,
  )
  return new Uint8Array(plaintext)
}

function createSuite(): CipherSuite {
  return new CipherSuite({
    kem: new DhkemP256HkdfSha256(),
    kdf: new HkdfSha256(),
    aead: new Aes256Gcm(),
  })
}

export function assertSarmaV2Envelope(envelope: SarmaV2Envelope): void {
  if (envelope.version !== SARMA_V2_VERSION || envelope.suite !== SARMA_V2_SUITE) {
    throw new Error('Unsupported Sarma envelope version or cipher suite.')
  }
}

export function canonicalBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalJson(value))
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
  return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(',')}}`
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export function base64UrlToBytes(value: string): Uint8Array {
  const padded = value
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

export async function sha256Base64Url(value: Uint8Array): Promise<string> {
  const buffer = value.buffer.slice(
    value.byteOffset,
    value.byteOffset + value.byteLength,
  ) as ArrayBuffer
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)))
}
