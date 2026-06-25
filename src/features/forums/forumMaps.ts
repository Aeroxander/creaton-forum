export function toStringKeyMap<V>(
  value: Map<string, V> | Record<string, V> | undefined | null,
): Map<string, V> | undefined {
  if (!value) return undefined
  if (value instanceof Map) return value
  return new Map(Object.entries(value))
}
