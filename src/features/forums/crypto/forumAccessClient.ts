import type { Agent } from '@atproto/api'
import type { Hex, WalletClient } from 'viem'

import {
  createForumAccessSession,
  type ForumAccessSession,
  forumAccessSessionTypedData,
  saveForumAccessSession,
} from '~/features/forums/crypto/forumAccessSession'
import { configuredTempoChainId } from '~/features/wallets/chains'
import type {
  EncryptedForumPartialShare,
  ForumAccessReceipt,
  ForumRequestedCapsule,
} from '~/features/forums/crypto/forumThresholdAccess'

export const REQUEST_KEY_RELEASE_NSID = 'app.creaton.forum.requestKeyRelease'

export async function createSignedForumAccessSession(input: {
  agent: Agent
  walletClient: WalletClient
  boardUri: string
  issuerDid: string
  chainId?: number
  entitlementExpiresAt?: number
}): Promise<ForumAccessSession> {
  if (!input.agent.did) throw new Error('ATProto authentication is required.')
  const account = input.walletClient.account?.address
  if (!account) throw new Error('Connect a Tempo wallet before accessing this board.')
  const chainId = input.chainId ?? configuredTempoChainId()
  const session = await createForumAccessSession({
    did: input.agent.did,
    account,
    boardUri: input.boardUri,
    issuer: input.issuerDid,
    entitlementExpiresAt: input.entitlementExpiresAt,
  })
  const typedData = forumAccessSessionTypedData(session, chainId)
  const signature = await input.walletClient.signTypedData({
    account: input.walletClient.account,
    ...typedData,
  })
  const signed = { ...session, signature }
  await saveForumAccessSession(signed)
  return signed
}

export async function requestForumKeyRelease(input: {
  agent: Agent
  walletClient: WalletClient
  issuerEndpoint: string
  issuerDid: string
  boardUri: string
  session: ForumAccessSession
  capsules: ForumRequestedCapsule[]
  committeeEpoch: number
  eligibilityBlock: bigint
  fetchImpl?: typeof fetch
}): Promise<{
  receipt: ForumAccessReceipt
  shares: EncryptedForumPartialShare[]
  paymentReceipt?: string
}> {
  if (!input.agent.did || !input.session.signature) {
    throw new Error('A signed forum access session is required.')
  }
  const account = input.walletClient.account?.address
  if (!account) throw new Error('Connect a Tempo wallet before unlocking encrypted posts.')
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
  const response = await (input.fetchImpl ?? fetch)(
    new Request(endpoint, {
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
    }),
  )
  const result = (await response.json().catch(() => null)) as {
    receipt?: ForumAccessReceipt
    shares?: EncryptedForumPartialShare[]
    error?: string
    message?: string
  } | null
  if (!response.ok || !result?.receipt || !Array.isArray(result.shares)) {
    throw new Error(
      result?.message || result?.error || `Forum key release failed with HTTP ${response.status}.`,
    )
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
