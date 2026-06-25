import { useEffect, useState, type ReactNode } from 'react'

/** Defer sheet mount until after hydration — Tamagui Sheet portals break SSG/SSR. */
export function ClientSheet({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return children
}
