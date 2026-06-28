import { bytesToBase64Url, canonicalJson } from '~/features/forums/crypto/sarmaV2'
import type { TempoMppSubscriptionChallenge } from '~/features/forums/crypto/mppChallenge'

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

export function serializeMppCredential(credential: {
  challenge: TempoMppSubscriptionChallenge
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
