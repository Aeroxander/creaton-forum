export function shortDid(did: string) {
  if (did.length <= 20) return did
  return `${did.slice(0, 10)}…${did.slice(-6)}`
}
