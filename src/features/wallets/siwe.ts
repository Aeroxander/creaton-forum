import { createPublicClient, getAddress, http, type Address, type Hex } from 'viem'
import { createSiweMessage } from 'viem/siwe'

import {
  configuredTempoChainId,
  SUPPORTED_WALLET_CHAINS,
} from '~/features/wallets/chains'

export const ADDRESS_CONTROL_LEXICON = 'com.creaton.evm.addressControl'

export type EvmAddressString = `0x${string}`
export type DidString = `did:plc:${string}` | `did:web:${string}`

export const SUPPORTED_CHAINS = SUPPORTED_WALLET_CHAINS

export type SupportedChainId = (typeof SUPPORTED_CHAINS)[number]['id']

export type AtpBytesField = { $bytes: string }

export type LinkedWallet = {
  uri: string
  address: string
  primaryChainId: number
  alsoOn: number[]
}

export type AddressControlRecord = {
  $type: typeof ADDRESS_CONTROL_LEXICON
  address: AtpBytesField
  signature: AtpBytesField
  alsoOn?: number[]
  siwe: {
    domain: string
    address: string
    statement: string
    uri: string
    version: '1'
    chainId: number
    nonce: string
    issuedAt: string
  }
}

type DescribeServerResponse = {
  availableUserDomains?: string[]
}

/** Default chain for SIWE login, registration, and wallet linking. */
export const defaultPrimaryChainId = configuredTempoChainId()
export const defaultSiweUserDomain = import.meta.env.DEV ? '.test' : '.creaton.social'

export function isSupportedChainId(chainId: number | undefined): chainId is SupportedChainId {
  return SUPPORTED_CHAINS.some((chain) => chain.id === chainId)
}

export function getChainLabel(chainId: number): string {
  return SUPPORTED_CHAINS.find((chain) => chain.id === chainId)?.label ?? `Chain ${chainId}`
}

export function formatShortAddress(address: string): string {
  if (address.length < 11) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function normalizePdsUrl(serviceURL: string): string {
  const trimmed = serviceURL.trim()
  if (!trimmed) return 'http://localhost:2583'
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed.replace(/\/$/, '')
  }
  return `https://${trimmed}`.replace(/\/$/, '')
}

function normalizeUserDomain(domain: string): string {
  const trimmed = domain.trim().toLowerCase()
  if (!trimmed) return ''
  return trimmed.startsWith('.') ? trimmed : `.${trimmed}`
}

export async function getPdsDefaultUserDomain(service: string): Promise<string> {
  try {
    const response = await fetch(`${service}/xrpc/com.atproto.server.describeServer`)
    if (!response.ok) return defaultSiweUserDomain

    const body = (await response.json()) as DescribeServerResponse
    const domain = body.availableUserDomains?.map(normalizeUserDomain).find(Boolean)

    return domain ?? defaultSiweUserDomain
  } catch {
    return defaultSiweUserDomain
  }
}

export async function normalizeSiweIdentifier(
  identifier: string,
  service: string,
): Promise<string> {
  const trimmed = identifier.toLowerCase().trim().replace(/^@+/, '')
  if (!trimmed) return ''
  if (trimmed.startsWith('did:')) return trimmed
  if (trimmed.includes('@') || trimmed.includes('.')) return trimmed

  return `${trimmed}${await getPdsDefaultUserDomain(service)}`
}

export function toChecksumAddress(address: string): string {
  try {
    return getAddress(address)
  } catch {
    return address
  }
}

export function hexToBase64(hex: string): string {
  const raw = hex.startsWith('0x') ? hex.slice(2) : hex
  const bytes = new Uint8Array(raw.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(raw.slice(i * 2, i * 2 + 2), 16)
  }
  return btoa(String.fromCharCode(...bytes))
}

export function base64ToHex(base64: string): string {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

export function hexToAtpBytes(hex: string): AtpBytesField {
  return { $bytes: hexToBase64(hex) }
}

export function randomNonce(length = 24): string {
  const bytes = new Uint8Array(Math.ceil(length / 2))
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length)
}

export function makeSiweStatement(address: EvmAddressString, did: DidString): string {
  return `Prove control of ${address} to link it to ${did}`
}

export function createWalletLinkSiweMessage(input: {
  address: Address
  did: DidString
  chainId: number
  nonce: string
  issuedAt: Date
  domain?: string
  uri?: string
}): string {
  return createSiweMessage({
    domain: input.domain ?? window.location.host,
    address: input.address,
    statement: makeSiweStatement(input.address, input.did),
    uri: input.uri ?? window.location.origin,
    version: '1',
    chainId: input.chainId,
    nonce: input.nonce,
    issuedAt: input.issuedAt,
  })
}

export function buildAddressControlRecord(input: {
  address: Address
  did: DidString
  signature: Hex
  chainId: number
  nonce: string
  issuedAt: Date
  alsoOn?: number[]
  domain?: string
  uri?: string
}): AddressControlRecord {
  const domain = input.domain ?? window.location.host
  const uri = input.uri ?? window.location.origin
  const statement = makeSiweStatement(input.address, input.did)
  const alsoOn = input.alsoOn?.filter((chainId) => chainId !== input.chainId)

  return {
    $type: ADDRESS_CONTROL_LEXICON,
    address: hexToAtpBytes(input.address),
    signature: hexToAtpBytes(input.signature),
    ...(alsoOn && alsoOn.length > 0 ? { alsoOn } : {}),
    siwe: {
      domain,
      address: input.address,
      statement,
      uri,
      version: '1',
      chainId: input.chainId,
      nonce: input.nonce,
      issuedAt: input.issuedAt.toISOString(),
    },
  }
}

export function linkedWalletFromRecord(record: {
  uri: string
  value: {
    address?: AtpBytesField
    siwe?: { address?: string; chainId?: number }
    alsoOn?: number[]
  }
}): LinkedWallet | null {
  const address =
    record.value.siwe?.address ??
    (record.value.address ? base64ToHex(record.value.address.$bytes) : null)

  if (!address) return null

  return {
    uri: record.uri,
    address: toChecksumAddress(address),
    primaryChainId: record.value.siwe?.chainId ?? defaultPrimaryChainId,
    alsoOn: record.value.alsoOn ?? [],
  }
}

export async function verifyWalletLinkSignature(input: {
  chainId: number
  message: string
  signature: Hex
  address: Address
  nonce: string
  issuedAt: Date
}) {
  const supported = SUPPORTED_CHAINS.find((chain) => chain.id === input.chainId)
  if (!supported) throw new Error(`Unsupported chain ID: ${input.chainId}`)

  const client = createPublicClient({
    chain: supported.chain,
    transport: http(),
  })

  return client.verifySiweMessage({
    message: input.message,
    signature: input.signature,
    address: input.address,
    domain: window.location.host,
    nonce: input.nonce,
    time: input.issuedAt,
  })
}
