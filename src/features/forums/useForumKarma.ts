import { useQuery } from '@tanstack/react-query'
import { useAtomValue } from 'jotai'
import { fetchUserKarmaFromAppview } from '@creaton/forum-core'

import { forumAppviewURLAtom } from '~/utils/atoms'

const PUBLIC_FORUM_APPVIEW = 'https://forum.creaton.social'

/** Karma is optional — falls back to the public appview in dev when local isn't running. */
export function useForumKarma(did: string | undefined) {
  const forumAppviewUrl = useAtomValue(forumAppviewURLAtom)
  const karmaAppviewUrl = forumAppviewUrl ?? PUBLIC_FORUM_APPVIEW

  return useQuery({
    queryKey: ['__volatile', 'forum-karma', did, karmaAppviewUrl],
    queryFn: () => fetchUserKarmaFromAppview(karmaAppviewUrl, did!),
    enabled: !!did && did !== 'unknown',
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
}
