import type { Address } from 'viem'

import { base64UrlToBytes } from '~/features/forums/crypto/sarmaV2'

export type MppPaymentRequest = {
  amount: string
  currency: Address
  recipient: Address
  chainId?: number
  methodDetails?: { chainId?: number }
  description?: string
}

export type MppMethod = 'abstract' | 'tempo'
export type MppIntent = 'charge' | 'subscription'

export type MppChallenge = {
  id: string
  realm: string
  method: MppMethod
  intent: MppIntent
  request: MppPaymentRequest
  description?: string
  digest?: string
  expires?: string
  opaque?: Record<string, string>
}

export type AbstractMppChallenge = MppChallenge & { method: 'abstract'; intent: 'charge' }
export type TempoMppSubscriptionChallenge = MppChallenge & {
  method: 'tempo'
  intent: 'subscription'
}

export function parseRawMppChallenge(header: string): MppChallenge {
  const payment = extractPaymentParameters(header)
  const parameters = parseAuthParameters(payment)
  const requestValue = parameters.request
  if (!requestValue) throw new Error('MPP challenge omitted its payment request.')
  const request = decodeJson(requestValue) as MppPaymentRequest
  if (!parameters.id || !parameters.realm || !parameters.method || !parameters.intent) {
    throw new Error('MPP challenge is missing required authentication parameters.')
  }
  if (parameters.method !== 'abstract' && parameters.method !== 'tempo') {
    throw new Error(`Unsupported MPP method: ${parameters.method}.`)
  }
  if (parameters.intent !== 'charge' && parameters.intent !== 'subscription') {
    throw new Error(`Unsupported MPP intent: ${parameters.intent}.`)
  }

  return {
    id: parameters.id,
    realm: parameters.realm,
    method: parameters.method as MppMethod,
    intent: parameters.intent as MppIntent,
    request,
    ...(parameters.description ? { description: parameters.description } : {}),
    ...(parameters.digest ? { digest: parameters.digest } : {}),
    ...(parameters.expires ? { expires: parameters.expires } : {}),
    ...(parameters.opaque
      ? { opaque: decodeJson(parameters.opaque) as Record<string, string> }
      : {}),
  }
}

export function parseAbstractMppChallenge(header: string): AbstractMppChallenge {
  const challenge = parseRawMppChallenge(header)
  if (challenge.method !== 'abstract' || challenge.intent !== 'charge') {
    throw new Error('Unsupported MPP challenge; expected an Abstract charge.')
  }
  return challenge
}

export function parseTempoMppSubscriptionChallenge(header: string): TempoMppSubscriptionChallenge {
  const challenge = parseRawMppChallenge(header)
  if (challenge.method !== 'tempo' || challenge.intent !== 'subscription') {
    throw new Error('Unsupported MPP challenge; expected a Tempo subscription.')
  }
  return challenge
}

export function extractPaymentParameters(header: string): string {
  const match = /(?:^|,)\s*Payment\s+(.+)$/i.exec(header)
  if (!match?.[1]) throw new Error('WWW-Authenticate does not contain an MPP Payment challenge.')
  return match[1]
}

export function parseAuthParameters(value: string): Record<string, string> {
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
