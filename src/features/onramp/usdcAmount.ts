export function formatUsdcAtomic(value: string | bigint): string {
  const amount = typeof value === 'bigint' ? value : BigInt(value)
  const whole = amount / 1_000_000n
  const fraction = (amount % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole.toString()
}

export function usdcAtomicToUsdString(value: string | bigint): string {
  return formatUsdcAtomic(value)
}

export function parseUsdToUsdcAtomic(value: string): bigint {
  const trimmed = value.trim()
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) {
    throw new Error('Amount must be a valid USD value.')
  }
  const parts = trimmed.split('.')
  const whole = parts[0] ?? '0'
  const fraction = parts[1] ?? ''
  const paddedFraction = `${fraction}000000`.slice(0, 6)
  return BigInt(whole) * 1_000_000n + BigInt(paddedFraction)
}

export function needsUsdcFunding(
  balance: bigint | undefined,
  requiredAmount: string | bigint,
): boolean {
  const required = typeof requiredAmount === 'bigint' ? requiredAmount : BigInt(requiredAmount)
  if (required <= 0n) return false
  if (balance === undefined) return true
  return balance < required
}

export function isInsufficientTokenError(message: string): boolean {
  return /insufficient|exceeds balance|transfer amount exceeds|not enough|funds/i.test(message)
}
