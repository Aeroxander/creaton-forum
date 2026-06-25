import { parseAtUri } from '@creaton/forum-core'

export function formatForumDate(value: string | undefined) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export { shortDid } from '~/utils/shortDid'

export function authorDidFromUri(uri: string) {
  return parseAtUri(uri)?.did ?? 'unknown'
}

export const FORUM_THREAD_STEP = 28

export function forumThreadMarginLeft(depth: number) {
  if (depth <= 0) return 0
  return depth * FORUM_THREAD_STEP
}
