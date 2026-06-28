import { lazy, Suspense, useId, useState, type FormEvent } from 'react'
import { Dialog, SizableText, Spinner, YStack } from 'tamagui'

import { formatShortAddress } from '~/features/wallets/siwe'
import { Button } from '~/interface/buttons/Button'
import { Input } from '~/interface/forms/Input'
import { showToast } from '~/interface/toast/helpers'

import {
  createOnrampOrder,
  getConfiguredOnrampChainLabel,
  getCrossmintClientApiKey,
  type OnrampOrderResponse,
  type OnrampRecipient,
  validateOnrampSetup,
} from './crossmintOnramp'

const CrossmintEmbeddedOrder = lazy(() =>
  import('./CrossmintEmbeddedOrder').then((module) => ({
    default: module.CrossmintEmbeddedOrder,
  })),
)

type OnrampCheckoutDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  recipient: OnrampRecipient | null
  title: string
  submitLabel: string
  defaultAmount?: string
}

export function OnrampCheckoutDialog({
  open,
  onOpenChange,
  recipient,
  title,
  submitLabel,
  defaultAmount = '5',
}: OnrampCheckoutDialogProps) {
  const emailId = useId()
  const amountId = useId()
  const [receiptEmail, setReceiptEmail] = useState('')
  const [amount, setAmount] = useState(defaultAmount)
  const [order, setOrder] = useState<OnrampOrderResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isCreatingOrder, setIsCreatingOrder] = useState(false)

  const setupError = validateOnrampSetup()
  const clientApiKey = getCrossmintClientApiKey()
  const chainLabel = getConfiguredOnrampChainLabel()

  const changeOpen = (nextOpen: boolean) => {
    if (!nextOpen) {
      setOrder(null)
      setError(null)
      setAmount(defaultAmount)
    }
    onOpenChange(nextOpen)
  }

  const createOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!recipient || setupError) return

    setError(null)
    setIsCreatingOrder(true)
    try {
      const nextOrder = await createOnrampOrder({
        recipientDid: recipient.did,
        recipientWallet: recipient.walletAddress,
        chainId: recipient.chainId,
        receiptEmail,
        amount,
      })
      setOrder(nextOrder)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to create Crossmint order.'
      setError(message)
      showToast('Onramp failed', { message, type: 'error' })
    } finally {
      setIsCreatingOrder(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <Dialog.Portal>
        <Dialog.Overlay opacity={0.5} />
        <Dialog.Content
          bordered
          elevate
          maxW={420}
          width="100%"
          p="$4"
        >
          <YStack gap="$4">
            <SizableText size="$6" fontWeight="700">
              {title}
            </SizableText>

            {recipient && (
              <YStack p="$3" bg="$color3" rounded="$3" gap="$1">
                <SizableText size="$3" fontWeight="600">
                  {recipient.label ?? 'Recipient'}
                </SizableText>
                <SizableText size="$2" opacity={0.6}>
                  {chainLabel} · {formatShortAddress(recipient.walletAddress)}
                </SizableText>
              </YStack>
            )}

            {setupError ? (
              <YStack p="$3" bg="$red2" rounded="$3">
                <SizableText size="$3" color="$red11">
                  {setupError}
                </SizableText>
              </YStack>
            ) : order ? (
              <Suspense
                fallback={
                  <YStack p="$3" bg="$color3" rounded="$3" items="center">
                    <Spinner size="small" />
                    <SizableText size="$3">Loading checkout…</SizableText>
                  </YStack>
                }
              >
                <CrossmintEmbeddedOrder
                  apiKey={clientApiKey}
                  clientSecret={order.clientSecret}
                  orderId={order.orderId}
                  receiptEmail={receiptEmail}
                />
              </Suspense>
            ) : (
              <form
                onSubmit={createOrder}
                style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
              >
                {error && (
                  <YStack p="$3" bg="$red2" rounded="$3">
                    <SizableText size="$3" color="$red11">
                      {error}
                    </SizableText>
                  </YStack>
                )}

                <YStack gap="$1">
                  <SizableText size="$3" fontWeight="600">
                    Receipt email
                  </SizableText>
                  <Input
                    placeholder="you@example.com"
                    required
                    type="email"
                    value={receiptEmail}
                    onChangeText={setReceiptEmail}
                  />
                </YStack>

                <YStack gap="$1">
                  <SizableText size="$3" fontWeight="600">
                    Amount in USD
                  </SizableText>
                  <Input
                    placeholder="5"
                    required
                    inputMode="decimal"
                    min="1"
                    value={amount}
                    onChangeText={setAmount}
                  />
                </YStack>

                <Button
                  theme="blue"
                  disabled={!recipient || isCreatingOrder || !receiptEmail || !amount}
                >
                  {isCreatingOrder ? 'Creating checkout…' : submitLabel}
                </Button>
              </form>
            )}
          </YStack>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  )
}
