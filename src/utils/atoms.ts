import { atom } from 'jotai'

import {
  DEFAULT_CONSTELLATION_URL,
  DEFAULT_SLINGSHOT_URL,
} from '~/constants/urls'

export const constellationURLAtom = atom(DEFAULT_CONSTELLATION_URL)
export const slingshotURLAtom = atom(DEFAULT_SLINGSHOT_URL)
export const forumAppviewURLAtom = atom<string | undefined>(
  import.meta.env.VITE_CREATON_FORUM_APPVIEW_URL || undefined,
)
export const quickAuthAtom = atom<string | null>(null)
