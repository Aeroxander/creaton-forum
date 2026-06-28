import type { AbstractClient } from '@abstract-foundation/agw-client'
import {
  type Address,
  createPublicClient,
  erc20Abi,
  type Hex,
  http,
  parseAbi,
} from 'viem'
import { abstract, abstractTestnet } from 'viem/chains'

import {
  base64UrlToBytes,
  bytesToBase64Url,
  canonicalJson,
} from '~/features/forums/crypto/sarmaV2'

const ABSTRACT_CHAIN_IDS = [2741, 11124] as const
const ERC3009_VERSION_ABI = parseAbi(['function version() view returns (string)'])

export const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const

export type AbstractMppChargeRequest = {
  amount: string
  currency: Address
  recipient: Address
  chainId?: number
  methodDetails?: { chainId?: number }
  description?: string
}

export type MppChallenge = {
  id: string
  realm: string
  method: 'abstract'
  intent: 'charge'
  request: AbstractMppChargeRequest
  description?: string
  digest?: string
  expires?: string
  opaque?: Record<string, string>
}

export async function fetchWithAbstractMppCharge(input: {
  abstractClient: AbstractClient
  request: Request
  fetchImpl?: typeof fetch
  rpcUrl?: string
  erc3009Domain?: {
    name: string
    version: string
    chainId: number
    verifyingContract: Address
  }
}): Promise<Response> {
  const fetchImpl = input.fetchImpl ?? fetch
  const firstResponse = await fetchImpl(input.request.clone())
  if (firstResponse.status !== 402) return firstResponse

  const challengeHeader = firstResponse.headers.get('www-authenticate')
  if (!challengeHeader) throw new Error('MPP payment response omitted WWW-Authenticate.')
  const challenge = parseMppChallenge(challengeHeader)
  const credential = await createAbstractMppChargeCredential({
    abstractClient: input.abstractClient,
    challenge,
    rpcUrl: input.rpcUrl,
    erc3009Domain: input.erc3009Domain,
  })

  const retry = input.request.clone()
  const existingAuthorization = retry.headers.get('authorization')
  retry.headers.set(
    'authorization',
    existingAuthorization ? `${existingAuthorization}, ${credential}` : credential,
  )
  return fetchImpl(retry)
}

export async function createAbstractMppChargeCredential(input: {
  abstractClient: AbstractClient
  challenge: MppChallenge
  rpcUrl?: string
  now?: number
  nonce?: Hex
  erc3009Domain?: {
    name: string
    version: string
    chainId: number
    verifyingContract: Address
  }
}): Promise<string> {
  const { challenge } = input
  const chainId = challenge.request.methodDetails?.chainId ?? challenge.request.chainId ?? 2741
  assertAbstractChainId(chainId)
  assertAddress(challenge.request.currency, 'currency')
  assertAddress(challenge.request.recipient, 'recipient')
  if (!/^\d+$/.test(challenge.request.amount)) {
    throw new Error('Abstract MPP charge amount must be an atomic base-10 integer.')
  }

  const account = input.abstractClient.account.address
  const nonce = input.nonce ?? randomHex32()
  const validAfter = 0n
  const now = input.now ?? Date.now()
  const validBefore = challenge.expires
    ? BigInt(Math.floor(new Date(challenge.expires).getTime() / 1_000))
    : BigInt(Math.floor(now / 1_000) + 1_800)
  if (validBefore <= BigInt(Math.floor(now / 1_000))) {
    throw new Error('Abstract MPP challenge has expired.')
  }

  const domain =
    input.erc3009Domain ??
    (await readErc3009Domain({
      chainId,
      currency: challenge.request.currency,
      rpcUrl: input.rpcUrl,
    }))
  if (
    domain.chainId !== chainId ||
    domain.verifyingContract.toLowerCase() !== challenge.request.currency.toLowerCase()
  ) {
    throw new Error('ERC-3009 signing domain does not match the MPP challenge.')
  }
  const signature = await input.abstractClient.signTypedData({
    domain,
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: 'TransferWithAuthorization',
    message: {
      from: account,
      to: challenge.request.recipient,
      value: BigInt(challenge.request.amount),
      validAfter,
      validBefore,
      nonce,
    },
  })

  return serializeMppCredential({
    challenge,
    source: `did:pkh:eip155:${chainId}:${account}`,
    payload: {
      type: 'authorization',
      signature,
      nonce,
      validAfter: validAfter.toString(),
      validBefore: validBefore.toString(),
      from: account,
    },
  })
}

export function parseMppChallenge(header: string): MppChallenge {
  const payment = extractPaymentParameters(header)
  const parameters = parseAuthParameters(payment)
  const requestValue = parameters.request
  if (!requestValue) throw new Error('MPP challenge omitted its payment request.')
  const request = decodeJson(requestValue) as AbstractMppChargeRequest
  if (
    parameters.method !== 'abstract' ||
    parameters.intent !== 'charge' ||
    !parameters.id ||
    !parameters.realm
  ) {
    throw new Error('Unsupported MPP challenge; expected an Abstract charge.')
  }

  return {
    id: parameters.id,
    realm: parameters.realm,
    method: 'abstract',
    intent: 'charge',
    request,
    ...(parameters.description ? { description: parameters.description } : {}),
    ...(parameters.digest ? { digest: parameters.digest } : {}),
    ...(parameters.expires ? { expires: parameters.expires } : {}),
    ...(parameters.opaque
      ? { opaque: decodeJson(parameters.opaque) as Record<string, string> }
      : {}),
  }
}

export function serializeMppCredential(credential: {
  challenge: MppChallenge
  payload: Record<string, unknown>
  source?: string
}): string {
  const request = bytesToBase64Url(
    new TextEncoder().encode(canonicalJson(credential.challenge.request)),
  )
  const wire = {
    challenge: { ...credential.challenge, request },
    payload: credential.payload,
    ...(credential.source ? { source: credential.source } : {}),
  }
  return `Payment ${bytesToBase64Url(new TextEncoder().encode(JSON.stringify(wire)))}`
}

async function readErc3009Domain(input: {
  chainId: (typeof ABSTRACT_CHAIN_IDS)[number]
  currency: Address
  rpcUrl?: string
}) {
  const chain = input.chainId === abstract.id ? abstract : abstractTestnet
  const client = createPublicClient({ chain, transport: http(input.rpcUrl) })
  let name = 'USD Coin'
  let version = '2'
  try {
    name = await client.readContract({
      address: input.currency,
      abi: erc20Abi,
      functionName: 'name',
    })
  } catch {
    // The Abstract plugin uses the same USDC defaults when RPC metadata is unavailable.
  }
  try {
    version = await client.readContract({
      address: input.currency,
      abi: ERC3009_VERSION_ABI,
      functionName: 'version',
    })
  } catch {
    // The Abstract plugin uses the same USDC defaults when RPC metadata is unavailable.
  }
  return { name, version, chainId: input.chainId, verifyingContract: input.currency }
}

function extractPaymentParameters(header: string): string {
  const match = /(?:^|,)\s*Payment\s+(.+)$/i.exec(header)
  if (!match?.[1]) throw new Error('WWW-Authenticate does not contain an MPP Payment challenge.')
  return match[1]
}

function parseAuthParameters(value: string): Record<string, string> {
  const result: Record<string, string> = {}
  let cursor = 0
  while (cursor < value.length) {
    while (/[\s,]/.test(value[cursor] ?? '')) cursor++
    if (cursor >= value.length) break
    const keyStart = cursor
    while (/[A-Za-z0-9_-]/.test(value[cursor] ?? '')) cursor++
    const key = value.slice(keyStart, cursor)
    while (/\s/.test(value[cursor] ?? '')) cursor++
    if (!key || value[cursor] !== '=') throw new Error('Malformed MPP authentication parameter.')
    cursor++
    while (/\s/.test(value[cursor] ?? '')) cursor++
    if (value[cursor] !== '"') throw new Error('MPP authentication parameters must be quoted.')
    cursor++
    let parameter = ''
    let escaped = false
    while (cursor < value.length) {
      const character = value[cursor++]
      if (escaped) {
        parameter += character
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === '"') {
        break
      } else {
        parameter += character
      }
    }
    if (key in result) throw new Error(`Duplicate MPP authentication parameter: ${key}`)
    result[key] = parameter
  }
  return result
}

function decodeJson(value: string): unknown {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value)))
}

function randomHex32(): Hex {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

function assertAbstractChainId(
  chainId: number,
): asserts chainId is (typeof ABSTRACT_CHAIN_IDS)[number] {
  if (!ABSTRACT_CHAIN_IDS.includes(chainId as (typeof ABSTRACT_CHAIN_IDS)[number])) {
    throw new Error(`Unsupported Abstract chain ID: ${chainId}.`)
  }
}

function assertAddress(value: string, field: string): asserts value is Address {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`Abstract MPP ${field} must be an EVM address.`)
  }
}
