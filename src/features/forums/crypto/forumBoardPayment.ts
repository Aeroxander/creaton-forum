import type { AbstractClient } from '@abstract-foundation/agw-client'
import type { Agent } from '@atproto/api'
import { erc20Abi, type Address, type Hex } from 'viem'

import type { CreatonForumAccessPolicy } from '@creaton/forum-core'

import { createSignedForumAccessSession } from '~/features/forums/crypto/forumAccessClient'
import type { ForumAccessSession } from '~/features/forums/crypto/forumAccessSession'

export const CONFIRM_BOARD_PAYMENT_NSID = 'app.creaton.forum.confirmBoardPayment'

export async function transferBoardUsdcPayment(input: {
  abstractClient: AbstractClient
  asset: Address
  payTo: Address
  amount: bigint
}): Promise<Hex> {
  return input.abstractClient.writeContract({
    address: input.asset,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [input.payTo, input.amount],
  })
}

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

export async function confirmBoardPayment(input: {
  agent: Agent
  abstractClient: AbstractClient
  boardUri: string
  issuerDid: string
  issuerEndpoint: string
  txHash: Hex
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
      abstractClient: input.abstractClient,
      boardUri: input.boardUri,
      issuerDid: input.issuerDid,
    }))
  const auth = await input.agent.com.atproto.server.getServiceAuth({
    aud: input.issuerDid,
    lxm: CONFIRM_BOARD_PAYMENT_NSID,
    exp: Math.floor(Date.now() / 1_000) + 5 * 60,
  })
  const endpoint = new URL(`/xrpc/${CONFIRM_BOARD_PAYMENT_NSID}`, input.issuerEndpoint)
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${auth.data.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      boardUri: input.boardUri,
      txHash: input.txHash,
      certificate: serializeCertificate(session),
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
      body?.message || body?.error || `Board payment confirmation failed (${response.status}).`,
    )
  }
  return { entitlement: body.entitlement }
}

export function isInsufficientUsdcError(message: string): boolean {
  return /insufficient|exceeds balance|transfer amount exceeds|not enough|funds/i.test(message)
}

export function boardAccessAmount(access: Pick<CreatonForumAccessPolicy, 'amount'>): bigint {
  return BigInt(access.amount)
}
