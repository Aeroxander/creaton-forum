import { CrossmintEmbeddedCheckout, CrossmintProvider } from '@crossmint/client-sdk-react-ui'

type CrossmintEmbeddedOrderProps = {
  apiKey: string
  orderId: string
  clientSecret: string
  receiptEmail: string
}

export function CrossmintEmbeddedOrder({
  apiKey,
  orderId,
  clientSecret,
  receiptEmail,
}: CrossmintEmbeddedOrderProps) {
  return (
    <CrossmintProvider apiKey={apiKey}>
      <CrossmintEmbeddedCheckout
        orderId={orderId}
        clientSecret={clientSecret}
        payment={{
          receiptEmail,
          crypto: { enabled: false },
          fiat: { enabled: true },
          defaultMethod: 'fiat',
        }}
      />
    </CrossmintProvider>
  )
}
