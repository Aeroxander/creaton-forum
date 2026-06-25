import type { Agent, AppBskyActorProfile } from '@atproto/api'
import { queryOptions, useQuery } from '@tanstack/react-query'
import { useAtomValue } from 'jotai'

import {
  buildServiceUrl,
  fetchLocalAtUriRecord,
  isOwnProfileDid,
  localIdentityForAgent,
  markProfileKnownState,
  matchesLocalIdentity,
  profileUriFromDid,
  shouldFetchProfileRecord,
  type IdentityRecord,
  type ProfileRecord,
} from '~/features/profile/profileUtils'
import { slingshotURLAtom } from '~/utils/atoms'

async function fetchProfileFromSlingshot(
  uri: string,
  slingshoturl?: string,
): Promise<ProfileRecord | null> {
  const host = slingshoturl || 'slingshot.microcosm.blue'
  const response = await fetch(
    buildServiceUrl(
      host,
      `/xrpc/com.bad-example.repo.getUriRecord?at_uri=${encodeURIComponent(uri)}`,
    ),
  )

  let data: unknown
  try {
    data = await response.json()
  } catch {
    return null
  }

  if (response.status === 400 || response.status === 404 || response.status === 500) {
    return null
  }

  if (
    data &&
    typeof data === 'object' &&
    'error' in data &&
    (data as { error?: string }).error === 'InvalidRequest' &&
    String((data as { message?: string }).message ?? '').includes('Could not find repo')
  ) {
    return null
  }

  if (!response.ok) return null
  return data as ProfileRecord
}

export function constructProfileQuery(
  did: string | undefined,
  slingshoturl?: string,
  agent?: Agent | null,
  mode: 'display' | 'edit' = 'display',
) {
  const uri = did ? profileUriFromDid(did) : undefined
  const shouldFetch = shouldFetchProfileRecord(agent, did, mode)

  return queryOptions({
    queryKey: ['profile', did, import.meta.env.DEV ? agent?.did : undefined, mode],
    queryFn: async (): Promise<ProfileRecord | null> => {
      if (!uri || !did) return null

      const localRecord = await fetchLocalAtUriRecord<AppBskyActorProfile.Record>(uri, agent)
      if (localRecord) {
        if (isOwnProfileDid(agent, did)) markProfileKnownState(did, 'exists')
        return localRecord
      }

      if (isOwnProfileDid(agent, did)) {
        if (import.meta.env.DEV) {
          markProfileKnownState(did, 'missing')
          return null
        }
        return fetchProfileFromSlingshot(uri, slingshoturl)
      }

      return fetchProfileFromSlingshot(uri, slingshoturl)
    },
    enabled: !!did && shouldFetch,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

export function constructIdentityQuery(
  identifier: string | undefined,
  slingshoturl?: string,
  localIdentity?: ReturnType<typeof localIdentityForAgent>,
) {
  return queryOptions({
    queryKey: ['identity', identifier, localIdentity?.did, localIdentity?.pds],
    queryFn: async (): Promise<IdentityRecord | null> => {
      if (!identifier) return null
      if (localIdentity && matchesLocalIdentity(identifier, localIdentity)) {
        return {
          did: localIdentity.did,
          handle: localIdentity.handle,
          pds: localIdentity.pds,
          signing_key: localIdentity.signing_key,
        }
      }

      const host = slingshoturl || 'slingshot.microcosm.blue'
      const response = await fetch(
        buildServiceUrl(
          host,
          `/xrpc/com.bad-example.identity.resolveMiniDoc?identifier=${encodeURIComponent(identifier)}`,
        ),
      )
      if (!response.ok) return null
      try {
        return (await response.json()) as IdentityRecord
      } catch {
        return null
      }
    },
    enabled: !!identifier,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

export function useQueryProfile(
  did: string | undefined,
  agent?: Agent | null,
  mode: 'display' | 'edit' = 'display',
) {
  const slingshoturl = useAtomValue(slingshotURLAtom)
  return useQuery(constructProfileQuery(did, slingshoturl, agent, mode))
}

export function useQueryIdentity(identifier: string | undefined, agent?: Agent | null) {
  const slingshoturl = useAtomValue(slingshotURLAtom)
  return useQuery(
    constructIdentityQuery(identifier, slingshoturl, localIdentityForAgent(agent)),
  )
}
