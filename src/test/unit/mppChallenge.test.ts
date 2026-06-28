import { describe, expect, test } from 'vitest'

import { bytesToBase64Url, canonicalJson } from '~/features/forums/crypto/sarmaV2'
import {
  parseAbstractMppChallenge,
  parseRawMppChallenge,
  parseTempoMppSubscriptionChallenge,
} from '~/features/forums/crypto/mppChallenge'

function encodeRequest(request: Record<string, unknown>): string {
  return bytesToBase64Url(new TextEncoder().encode(canonicalJson(request)))
}

function buildChallengeHeader(input: {
  method: string
  intent: string
  id?: string
  realm?: string
  request: Record<string, unknown>
  expires?: string
}): string {
  const request = encodeRequest(input.request)
  const parts = [
    `method="${input.method}"`,
    `intent="${input.intent}"`,
    `id="${input.id ?? 'challenge-1'}"`,
    `realm="${input.realm ?? 'creaton-forum'}"`,
    `request="${request}"`,
  ]
  if (input.expires) parts.push(`expires="${input.expires}"`)
  return `Payment ${parts.join(', ')}`
}

const sampleRequest = {
  amount: '5000000',
  currency: '0x0000000000000000000000000000000000000001',
  recipient: '0x0000000000000000000000000000000000000002',
  chainId: 4217,
}

describe('mppChallenge', () => {
  test('parseRawMppChallenge accepts Tempo subscription challenges', () => {
    const header = buildChallengeHeader({
      method: 'tempo',
      intent: 'subscription',
      request: sampleRequest,
      expires: new Date(Date.now() + 60_000).toISOString(),
    })

    const challenge = parseRawMppChallenge(header)
    expect(challenge.method).toBe('tempo')
    expect(challenge.intent).toBe('subscription')
    expect(challenge.request.amount).toBe('5000000')
    expect(challenge.request.chainId).toBe(4217)
  })

  test('parseTempoMppSubscriptionChallenge rejects Abstract charge challenges', () => {
    const header = buildChallengeHeader({
      method: 'abstract',
      intent: 'charge',
      request: { ...sampleRequest, chainId: 2741 },
    })

    expect(() => parseTempoMppSubscriptionChallenge(header)).toThrow(
      'Unsupported MPP challenge; expected a Tempo subscription.',
    )
  })

  test('parseAbstractMppChallenge rejects Tempo subscription challenges', () => {
    const header = buildChallengeHeader({
      method: 'tempo',
      intent: 'subscription',
      request: sampleRequest,
    })

    expect(() => parseAbstractMppChallenge(header)).toThrow(
      'Unsupported MPP challenge; expected an Abstract charge.',
    )
  })

  test('parseRawMppChallenge rejects unknown methods', () => {
    const header = buildChallengeHeader({
      method: 'stripe',
      intent: 'charge',
      request: sampleRequest,
    })

    expect(() => parseRawMppChallenge(header)).toThrow('Unsupported MPP method: stripe.')
  })
})
