import type { WalletClient } from 'viem'

import {
  parseMppChallenge,
  serializeMppCredential,
  TRANSFER_WITH_AUTHORIZATION_TYPES,
} from '~/features/forums/crypto/abstractMppCharge'
import { base64UrlToBytes, bytesToBase64Url, canonicalJson } from '~/features/forums/crypto/sarmaV2'

export type TempoMppSubscriptionChallenge = ReturnType<typeof parseTempoMppSubscriptionChallenge>

export function parseTempoMppSubscriptionChallenge(header: string) {
  const challenge = parseMppChallenge(header)
  if (challenge.method !== 'tempo' || challenge.intent !== 'subscription') {
    throw new Error('Unsupported MPP challenge; expected a Tempo subscription.')
  }
  return challenge
}

export async function createTempoMppSubscriptionCredential(input: {
  walletClient: WalletClient
  challenge: TempoMppSubscriptionChallenge
  rpcUrl?: string
  now?: number
  nonce?: `0x${string}`
}): Promise<string> {
  const account = input.walletClient.account
  if (!account) throw new Error('Connect a Tempo wallet before subscribing.')

  const chainId = input.challenge.request.methodDetails?.chainId ?? input.challenge.request.chainId
  if (chainId !== 4217 && chainId !== 42429) {
    throw new Error(`Unsupported Tempo chain ID: ${chainId}.`)
  }
  if (!/^\d+$/.test(input.challenge.request.amount)) {
    throw new Error('Tempo MPP subscription amount must be an atomic base-10 integer.')
  }

  const nonce = input.nonce ?? randomHex32()
  const validAfter = 0n
  const now = input.now ?? Date.now()
  const validBefore = input.challenge.expires
    ? BigInt(Math.floor(new Date(input.challenge.expires).getTime() / 1_000))
    : BigInt(Math.floor(now / 1_000) + 1_800)
  if (validBefore <= BigInt(Math.floor(now / 1_000))) {
    throw new Error('Tempo MPP challenge has expired.')
  }

  const currency = input.challenge.request.currency
  const domain = {
    name: 'PathUSD',
    version: '1',
    chainId,
    verifyingContract: currency,
  }
  const signature = await input.walletClient.signTypedData({
    account,
    domain,
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: 'TransferWithAuthorization',
    message: {
      from: account.address,
      to: input.challenge.request.recipient,
      value: BigInt(input.challenge.request.amount),
      validAfter,
      validBefore,
      nonce,
    },
  })

  return serializeMppCredential({
    challenge: input.challenge,
    source: `did:pkh:eip155:${chainId}:${account.address}`,
    payload: {
      type: 'authorization',
      signature,
      nonce,
      validAfter: validAfter.toString(),
      validBefore: validBefore.toString(),
      from: account.address,
    },
  })
}

export async function fetchWithTempoMppSubscription(input: {
  walletClient: WalletClient
  request: Request
  fetchImpl?: typeof fetch
}): Promise<Response> {
  const fetchImpl = input.fetchImpl ?? fetch
  const firstResponse = await fetchImpl(input.request.clone())
  if (firstResponse.status !== 402) return firstResponse

  const challengeHeader = firstResponse.headers.get('www-authenticate')
  if (!challengeHeader) throw new Error('MPP subscription response omitted WWW-Authenticate.')
  const challenge = parseTempoMppSubscriptionChallenge(challengeHeader)
  const credential = await createTempoMppSubscriptionCredential({
    walletClient: input.walletClient,
    challenge,
  })

  const retry = input.request.clone()
  const existingAuthorization = retry.headers.get('authorization')
  retry.headers.set(
    'authorization',
    existingAuthorization ? `${existingAuthorization}, ${credential}` : credential,
  )
  return fetchImpl(retry)
}

function randomHex32(): `0x${string}` {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}
