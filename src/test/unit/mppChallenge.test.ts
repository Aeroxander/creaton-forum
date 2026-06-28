import { describe, expect, test } from 'vitest'

import { bytesToBase64Url, canonicalJson } from '~/features/forums/crypto/sarmaV2'
import { parseTempoMppSubscriptionChallenge } from '~/features/forums/crypto/mppChallenge'

function encodeRequest(request: Record<string, unknown>): string {
  return bytesToBase64Url(new TextEncoder().encode(canonicalJson(request)))
}

function buildChallengeHeader(input: {
  request: Record<string, unknown>
  expires?: string
}): string {
  const request = encodeRequest(input.request)
  const parts = [
    'method="tempo"',
    'intent="subscription"',
    'id="challenge-1"',
    'realm="creaton-forum"',
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
  test('parseTempoMppSubscriptionChallenge accepts Tempo subscription challenges', () => {
    const header = buildChallengeHeader({
      request: sampleRequest,
      expires: new Date(Date.now() + 60_000).toISOString(),
    })

    const challenge = parseTempoMppSubscriptionChallenge(header)
    expect(challenge.method).toBe('tempo')
    expect(challenge.intent).toBe('subscription')
    expect(challenge.request.amount).toBe('5000000')
    expect(challenge.request.chainId).toBe(4217)
  })

  test('parseTempoMppSubscriptionChallenge rejects non-subscription challenges', () => {
    const header = buildChallengeHeader({ request: sampleRequest }).replace(
      'intent="subscription"',
      'intent="charge"',
    )

    expect(() => parseTempoMppSubscriptionChallenge(header)).toThrow(
      'Unsupported MPP challenge; expected a Tempo subscription.',
    )
  })
})
