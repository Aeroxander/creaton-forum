import { describe, expect, it } from 'vitest'

import {
  buildBoardLatestActivity,
  buildUnreadBoardTopics,
  isForumBoardUnseen,
  isForumTopicUnread,
  timestampFor,
} from '~/features/forums/forumUnread'

describe('forumUnread', () => {
  it('timestampFor returns 0 for invalid input', () => {
    expect(timestampFor()).toBe(0)
    expect(timestampFor('not-a-date')).toBe(0)
  })

  it('isForumTopicUnread when never seen', () => {
    expect(
      isForumTopicUnread('at://did/topic/1', '2024-01-01T00:00:00.000Z', undefined, {}),
    ).toBe(true)
  })

  it('isForumTopicUnread when seen after activity', () => {
    const createdAt = '2024-01-01T00:00:00.000Z'
    const seenAt = Date.parse('2024-01-02T00:00:00.000Z')
    expect(isForumTopicUnread('at://did/topic/1', createdAt, undefined, { 'at://did/topic/1': seenAt })).toBe(
      false,
    )
  })

  it('isForumBoardUnseen when unreadBoardTopics contains board', () => {
    const unread = new Set(['at://did/board/1'])
    expect(
      isForumBoardUnseen('at://did/board/1', new Map(), {}, unread),
    ).toBe(true)
  })

  it('buildUnreadBoardTopics collects boards with unread topics', () => {
    const topics = [
      {
        uri: 'at://did/topic/1',
        value: {
          createdAt: '2024-06-01T00:00:00.000Z',
          board: { uri: 'at://did/board/1' },
        },
      },
    ]
    const unread = buildUnreadBoardTopics(topics, undefined, {})
    expect(unread.has('at://did/board/1')).toBe(true)
  })

  it('buildBoardLatestActivity aggregates board and topic activity', () => {
    const boards = [
      {
        uri: 'at://did/board/1',
        value: { createdAt: '2024-01-01T00:00:00.000Z' },
      },
    ]
    const topics = [
      {
        uri: 'at://did/topic/1',
        value: {
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-06-01T00:00:00.000Z',
          board: { uri: 'at://did/board/1' },
        },
      },
    ]
    const latest = buildBoardLatestActivity(boards, topics, undefined)
    expect(latest.get('at://did/board/1')).toBe(Date.parse('2024-06-01T00:00:00.000Z'))
  })
})
