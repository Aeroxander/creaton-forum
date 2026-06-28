import type { AbstractClient } from '@abstract-foundation/agw-client'
import type { Agent } from '@atproto/api'
import type { Hex, WalletClient } from 'viem'

import { fetchWithAbstractMppCharge } from '~/features/forums/crypto/abstractMppCharge'
import {
  createForumAccessSession,
  type ForumAccessSession,
  forumAccessSessionTypedData,
  saveForumAccessSession,
} from '~/features/forums/crypto/forumAccessSession'
import type {
  EncryptedForumPartialShare,
  ForumAccessReceipt,
  ForumRequestedCapsule,
} from '~/features/forums/crypto/forumThresholdAccess'

export const REQUEST_KEY_RELEASE_NSID = 'app.creaton.forum.requestKeyRelease'

export async function createSignedForumAccessSession(input: {
  agent: Agent
  abstractClient?: AbstractClient
  walletClient?: WalletClient
  boardUri: string
  issuerDid: string
  chainId?: number
  entitlementExpiresAt?: number
}): Promise<ForumAccessSession> {
  if (!input.agent.did) throw new Error('ATProto authentication is required.')
  const account =
    input.walletClient?.account?.address ?? input.abstractClient?.account.address
  if (!account) throw new Error('Connect a wallet before accessing this board.')
  const chainId = input.chainId ?? 2741
  const session = await createForumAccessSession({
    did: input.agent.did,
    account,
    boardUri: input.boardUri,
    issuer: input.issuerDid,
    entitlementExpiresAt: input.entitlementExpiresAt,
  })
  const typedData = forumAccessSessionTypedData(session, chainId)
  let signature: Hex
  if (input.walletClient?.account) {
    signature = await input.walletClient.signTypedData({
      account: input.walletClient.account,
      ...typedData,
    })
  } else if (input.abstractClient) {
    signature = await input.abstractClient.signTypedData(typedData)
  } else {
    throw new Error('Connect a wallet before accessing this board.')
  }
  const signed = { ...session, signature }
  await saveForumAccessSession(signed)
  return signed
}

export async function requestForumKeyRelease(input: {
  agent: Agent
  abstractClient?: AbstractClient
  walletClient?: WalletClient
  chainId?: number
  issuerEndpoint: string
  issuerDid: string
  boardUri: string
  session: ForumAccessSession
  capsules: ForumRequestedCapsule[]
  committeeEpoch: number
  eligibilityBlock: bigint
  paymentProtocol?: 'mpp' | 'tempo'
  fetchImpl?: typeof fetch
  rpcUrl?: string
}): Promise<{
  receipt: ForumAccessReceipt
  shares: EncryptedForumPartialShare[]
  paymentReceipt?: string
}> {
  if (!input.agent.did || !input.session.signature) {
    throw new Error('A signed forum access session is required.')
  }
  const account =
    input.walletClient?.account?.address ?? input.abstractClient?.account.address
  if (!account) throw new Error('Connect a wallet before unlocking encrypted posts.')
  if (
    input.session.did !== input.agent.did ||
    input.session.boardUri !== input.boardUri ||
    input.session.issuer !== input.issuerDid ||
    input.session.account.toLowerCase() !== account.toLowerCase()
  ) {
    throw new Error('Forum access session does not match the active identity.')
  }

  const auth = await input.agent.com.atproto.server.getServiceAuth({
    aud: input.issuerDid,
    lxm: REQUEST_KEY_RELEASE_NSID,
    exp: Math.floor(Date.now() / 1_000) + 5 * 60,
  })
  const endpoint = new URL(`/xrpc/${REQUEST_KEY_RELEASE_NSID}`, input.issuerEndpoint)
  const request = new Request(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${auth.data.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      boardUri: input.boardUri,
      capsules: input.capsules.map((capsule) => ({
        uri: capsule.uri,
        createdAt: capsule.value.createdAt,
        encapsulation: capsule.value.encapsulation,
      })),
      committeeEpoch: input.committeeEpoch,
      eligibilityBlock: input.eligibilityBlock.toString(),
      certificate: serializeCertificate(input.session),
    }),
  })
  const response =
    input.paymentProtocol === 'tempo'
      ? await (input.fetchImpl ?? fetch)(request)
      : await fetchWithAbstractMppCharge({
          abstractClient: input.abstractClient!,
          request,
          fetchImpl: input.fetchImpl,
          rpcUrl: input.rpcUrl,
        })
  const result = (await response.json().catch(() => null)) as {
    receipt?: ForumAccessReceipt
    shares?: EncryptedForumPartialShare[]
    error?: string
  } | null
  if (!response.ok || !result?.receipt || !Array.isArray(result.shares)) {
    throw new Error(result?.error ?? `Forum key release failed with HTTP ${response.status}.`)
  }
  return {
    receipt: result.receipt,
    shares: result.shares,
    paymentReceipt: response.headers.get('payment-receipt') ?? undefined,
  }
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
