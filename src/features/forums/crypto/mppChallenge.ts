import type { Address } from 'viem'

import { base64UrlToBytes } from '~/features/forums/crypto/sarmaV2'

export type MppPaymentRequest = {
  amount: string
  currency: Address
  recipient: Address
  chainId?: number
  methodDetails?: { chainId?: number }
  description?: string
  periodCount?: string
  periodUnit?: 'day' | 'week' | 'month'
}

export type TempoMppSubscriptionChallenge = {
  id: string
  realm: string
  method: 'tempo'
  intent: 'subscription'
  request: MppPaymentRequest
  description?: string
  digest?: string
  expires?: string
  opaque?: Record<string, string>
}

export function parseTempoMppSubscriptionChallenge(header: string): TempoMppSubscriptionChallenge {
  const payment = extractPaymentParameters(header)
  const parameters = parseAuthParameters(payment)
  const requestValue = parameters.request
  if (!requestValue) throw new Error('MPP challenge omitted its payment request.')
  const request = decodeJson(requestValue) as MppPaymentRequest
  if (
    parameters.method !== 'tempo' ||
    parameters.intent !== 'subscription' ||
    !parameters.id ||
    !parameters.realm
  ) {
    throw new Error('Unsupported MPP challenge; expected a Tempo subscription.')
  }

  return {
    id: parameters.id,
    realm: parameters.realm,
    method: 'tempo',
    intent: 'subscription',
    request,
    ...(parameters.description ? { description: parameters.description } : {}),
    ...(parameters.digest ? { digest: parameters.digest } : {}),
    ...(parameters.expires ? { expires: parameters.expires } : {}),
    ...(parameters.opaque
      ? { opaque: decodeJson(parameters.opaque) as Record<string, string> }
      : {}),
  }
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
