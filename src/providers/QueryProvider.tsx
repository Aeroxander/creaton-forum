import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { useState, type ReactNode } from 'react'

function createPersister() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return undefined
  }
  return createSyncStoragePersister({ storage: window.localStorage })
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            gcTime: 1000 * 60 * 60 * 24,
            staleTime: 30 * 1000,
          },
        },
      }),
  )

  const persister = createPersister()

  if (!persister) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) =>
          !query.queryKey.includes('__volatile') && query.queryKey[0] !== 'forum-decrypt',
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  )
}
