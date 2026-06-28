import type { Agent } from '@atproto/api'
import type { WalletClient } from 'viem'

import type { CreatonForumAccessPolicy } from '@creaton/forum-core'

import { createSignedForumAccessSession } from '~/features/forums/crypto/forumAccessClient'
import { saveForumBoardEntitlement } from '~/features/forums/crypto/forumBoardEntitlementStorage'
import type { ForumAccessSession } from '~/features/forums/crypto/forumAccessSession'
import { fetchWithTempoMppSubscription } from '~/features/forums/crypto/tempoMppSubscription'
import type { Hex } from 'viem'

export const CONFIRM_BOARD_PAYMENT_NSID = 'app.creaton.forum.confirmBoardPayment'

function serializeCertificate(session: ForumAccessSession) {
  return {
    version: session.version,
    did: session.did,
    account: session.account,
    boardUri: session.boardUri,
    issuer: session.issuer,
    publicKey: session.publicKey,
    sessionKeyHash: session.sessionKeyHash,
    nonce: session.nonce,
    issuedAt: session.issuedAt,
    expiresAt: session.expiresAt,
    signature: session.signature as Hex,
  }
}

export async function activateCreatorBoardSubscription(input: {
  agent: Agent
  walletClient: WalletClient
  boardUri: string
  issuerDid: string
  issuerEndpoint: string
  chainId?: number
  session?: ForumAccessSession
}): Promise<{
  entitlement: {
    validFrom: string
    validUntil: string
    paymentRef: string | null
  }
}> {
  if (!input.agent.did) throw new Error('ATProto authentication is required.')
  const session =
    input.session ??
    (await createSignedForumAccessSession({
      agent: input.agent,
      walletClient: input.walletClient,
      boardUri: input.boardUri,
      issuerDid: input.issuerDid,
      chainId: input.chainId,
    }))
  const auth = await input.agent.com.atproto.server.getServiceAuth({
    aud: input.issuerDid,
    lxm: CONFIRM_BOARD_PAYMENT_NSID,
    exp: Math.floor(Date.now() / 1_000) + 5 * 60,
  })
  const endpoint = new URL(`/xrpc/${CONFIRM_BOARD_PAYMENT_NSID}`, input.issuerEndpoint)
  const response = await fetchWithTempoMppSubscription({
    walletClient: input.walletClient,
    request: new Request(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${auth.data.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        boardUri: input.boardUri,
        certificate: serializeCertificate(session),
      }),
    }),
  })
  const body = (await response.json().catch(() => null)) as {
    entitlement?: {
      validFrom: string
      validUntil: string
      paymentRef: string | null
    }
    message?: string
    error?: string
  } | null
  if (!response.ok || !body?.entitlement) {
    throw new Error(
      body?.message || body?.error || `Creator subscription activation failed (${response.status}).`,
    )
  }
  if (input.agent.did) {
    await saveForumBoardEntitlement({
      did: input.agent.did,
      boardUri: input.boardUri,
      entitlement: body.entitlement,
    })
  }
  return { entitlement: body.entitlement }
}

export function boardAccessAmount(access: Pick<CreatonForumAccessPolicy, 'amount'>): bigint {
  return BigInt(access.amount)
}

export function formatSubscriptionPeriod(
  access: Pick<CreatonForumAccessPolicy, 'durationSeconds'>,
): string {
  const days = Math.round(access.durationSeconds / 86_400)
  if (days % 30 === 0) return `${days / 30} month${days / 30 === 1 ? '' : 's'}`
  if (days % 7 === 0) return `${days / 7} week${days / 7 === 1 ? '' : 's'}`
  return `${days} day${days === 1 ? '' : 's'}`
}
