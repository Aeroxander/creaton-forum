import {
  defaultPrimaryChainId,
  getChainLabel,
  isSupportedChainId,
  type LinkedWallet,
} from '~/features/wallets/siwe'

export type OnrampOrderRequest = {
  recipientDid: string
  recipientWallet: string
  chainId: number
  receiptEmail: string
  amount: string
}

export type OnrampOrderResponse = {
  orderId: string
  clientSecret: string
}

export type OnrampRecipient = {
  did: string
  walletAddress: string
  chainId: number
  label?: string
}

export function getOnrampApiBase(): string {
  return (import.meta.env.VITE_CROSSMINT_API_BASE || '').replace(/\/$/, '')
}

export function getCrossmintClientApiKey(): string {
  return import.meta.env.VITE_CROSSMINT_CLIENT_API_KEY || ''
}

export function getConfiguredOnrampChainId(): number {
  const raw = Number(import.meta.env.VITE_CROSSMINT_ALLOWED_CHAIN_ID)
  if (Number.isFinite(raw) && isSupportedChainId(raw)) return raw
  return defaultPrimaryChainId
}

export function getConfiguredOnrampChainLabel(): string {
  return getChainLabel(getConfiguredOnrampChainId())
}

export function selectOnrampWallet(
  wallets: LinkedWallet[] | undefined,
  chainId = getConfiguredOnrampChainId(),
): LinkedWallet | undefined {
  return wallets?.find(
    (wallet) => wallet.primaryChainId === chainId || wallet.alsoOn.includes(chainId),
  )
}

export function validateOnrampSetup(): string | null {
  if (!getCrossmintClientApiKey()) return 'Crossmint client API key is not configured.'
  if (!getOnrampApiBase()) return 'Crossmint order API is not configured.'
  return null
}

export async function createOnrampOrder(input: OnrampOrderRequest): Promise<OnrampOrderResponse> {
  const apiBase = getOnrampApiBase()
  if (!apiBase) throw new Error('Crossmint order API is not configured.')

  const response = await fetch(`${apiBase}/onramp/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  const body = (await response.json().catch(() => null)) as
    | (Partial<OnrampOrderResponse> & { message?: string; error?: string })
    | null

  if (!response.ok) {
    throw new Error(
      body?.message || body?.error || `Failed to create Crossmint order (${response.status})`,
    )
  }

  if (!body?.orderId || !body.clientSecret) {
    throw new Error('Crossmint order API returned an incomplete checkout response.')
  }

  return {
    orderId: body.orderId,
    clientSecret: body.clientSecret,
  }
}
