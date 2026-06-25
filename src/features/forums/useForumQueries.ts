import { useAtomValue } from 'jotai'

import {
  constellationURLAtom,
  forumAppviewURLAtom,
  slingshotURLAtom,
} from '~/utils/atoms'

export function useForumConfig() {
  const constellation = useAtomValue(constellationURLAtom)
  const slingshoturl = useAtomValue(slingshotURLAtom)
  const forumAppviewUrl = useAtomValue(forumAppviewURLAtom)

  return { constellation, slingshoturl, forumAppviewUrl }
}
