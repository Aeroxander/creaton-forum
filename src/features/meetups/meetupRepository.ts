import type { Agent } from '@atproto/api'
import {
  parseAtUri,
  type ForumRecord,
  type StrongRef,
} from '@creaton/forum-core'

import { isEventUpcoming } from '~/features/meetups/meetupFormat'
import {
  CALENDAR_EVENT_COLLECTION,
  CALENDAR_RSVP_COLLECTION,
  CREATON_BOARD_SOURCE,
  EVENT_MODE,
  EVENT_STATUS,
  extractBoardUriFromEvent,
  RSVP_STATUS,
  type CalendarEventRecord,
  type CalendarRsvpRecord,
  type MeetupEventMode,
  type MeetupRsvpStatus,
  rsvpStatusToShort,
} from '~/features/meetups/meetupTypes'

type CreateRecordResponse = {
  uri: string
  cid: string
}

type RepoAgent = Agent & {
  did?: string
  com: {
    atproto: {
      repo: {
        createRecord: (input: {
          repo: string
          collection: string
          record: unknown
          rkey?: string
        }) => Promise<{ data?: CreateRecordResponse } & CreateRecordResponse>
        putRecord?: (input: {
          repo: string
          collection: string
          rkey: string
          record: unknown
        }) => Promise<{ data?: CreateRecordResponse } & CreateRecordResponse>
        listRecords?: (input: {
          repo: string
          collection: string
          limit?: number
          cursor?: string
        }) => Promise<{ data: { records: { uri: string; value: unknown }[]; cursor?: string } }>
        deleteRecord?: (input: {
          repo: string
          collection: string
          rkey: string
        }) => Promise<unknown>
      }
    }
  }
}

type ListRecordsResponse<T> = {
  records: { uri: string; cid: string; value: T }[]
  cursor?: string
}

export async function getCalendarEvent({
  did,
  rkey,
  slingshoturl,
}: {
  did: string
  rkey: string
  slingshoturl?: string
}) {
  return getRecord<CalendarEventRecord>({
    repo: did,
    collection: CALENDAR_EVENT_COLLECTION,
    rkey,
    slingshoturl,
  })
}

export async function listBoardEvents({
  board,
  constellation,
  slingshoturl,
}: {
  board: StrongRef
  constellation?: string
  slingshoturl?: string
}) {
  const records = await listRemoteRecordsForSubject<CalendarEventRecord>({
    target: board.uri,
    collection: CALENDAR_EVENT_COLLECTION,
    path: '.uris.uri',
    constellation: requireConstellation(constellation),
    slingshoturl,
  })
  return dedupeRecords(records)
    .filter((event) => extractBoardUriFromEvent(event.value) === board.uri)
    .filter((event) => isEventUpcoming(event.value))
    .sort((a, b) => (a.value.startsAt ?? '').localeCompare(b.value.startsAt ?? ''))
}

export async function createBoardEvent(
  agent: Agent,
  input: {
    board: StrongRef
    name: string
    description?: string
    startsAt: string
    endsAt?: string
    mode?: MeetupEventMode
    locationName?: string
    onlineUrl?: string
  },
) {
  const repoAgent = requireRepoAgent(agent)
  const now = new Date().toISOString()
  const uris = [
    {
      $type: 'community.lexicon.calendar.event#uri' as const,
      uri: input.board.uri,
      name: 'Creaton Forum Board',
      source: CREATON_BOARD_SOURCE,
    },
  ]
  if (input.onlineUrl?.trim()) {
    uris.push({
      $type: 'community.lexicon.calendar.event#uri' as const,
      uri: input.onlineUrl.trim(),
      name: 'Online Meeting Link',
      source: CREATON_BOARD_SOURCE,
    })
  }

  const locations = []
  if (input.locationName?.trim()) {
    locations.push({
      $type: 'community.lexicon.location.geo' as const,
      latitude: '0',
      longitude: '0',
      name: input.locationName.trim(),
      source: CREATON_BOARD_SOURCE,
    })
  }

  const record: CalendarEventRecord = {
    $type: CALENDAR_EVENT_COLLECTION,
    name: input.name.trim(),
    description: input.description?.trim(),
    createdAt: now,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    mode: EVENT_MODE[input.mode ?? 'inperson'],
    status: EVENT_STATUS.scheduled,
    locations: locations.length > 0 ? locations : undefined,
    uris,
  }

  return createRecord<CalendarEventRecord>(repoAgent, {
    collection: CALENDAR_EVENT_COLLECTION,
    record,
  })
}

export async function updateEventRsvp(
  agent: Agent,
  input: { event: StrongRef; status: MeetupRsvpStatus },
) {
  const repoAgent = requireRepoAgent(agent)
  if (!repoAgent.com.atproto.repo.putRecord) {
    throw new Error('This session cannot write RSVPs.')
  }
  const record: CalendarRsvpRecord = {
    $type: CALENDAR_RSVP_COLLECTION,
    subject: input.event,
    status: RSVP_STATUS[input.status],
    createdAt: new Date().toISOString(),
  }
  const response = await repoAgent.com.atproto.repo.putRecord({
    repo: repoAgent.did!,
    collection: CALENDAR_RSVP_COLLECTION,
    rkey: await rsvpRkey(input.event.uri),
    record,
  })
  const ref = unwrapCreateResponse(response)
  return { ...ref, value: record }
}

export async function clearEventRsvp(agent: Agent, eventUri: string) {
  const repoAgent = requireRepoAgent(agent)
  if (!repoAgent.com.atproto.repo.deleteRecord) {
    throw new Error('This session cannot delete RSVPs.')
  }
  await repoAgent.com.atproto.repo.deleteRecord({
    repo: repoAgent.did!,
    collection: CALENDAR_RSVP_COLLECTION,
    rkey: await rsvpRkey(eventUri),
  })
}

export async function getViewerRsvpForEvent(agent: Agent, eventUri: string) {
  const repoAgent = requireRepoAgent(agent)
  if (!repoAgent.com.atproto.repo.listRecords) return undefined
  const rsvps = await listAgentRecords<CalendarRsvpRecord>(
    repoAgent,
    CALENDAR_RSVP_COLLECTION,
  )
  const match = rsvps.find((rsvp) => rsvp.value.subject?.uri === eventUri)
  if (!match) return undefined
  return rsvpStatusToShort(match.value.status)
}

async function rsvpRkey(eventUri: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(eventUri))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .substring(0, 13)
}

async function createRecord<T>(agent: RepoAgent, input: { collection: string; record: T }) {
  const response = await agent.com.atproto.repo.createRecord({
    repo: agent.did!,
    collection: input.collection,
    record: input.record,
  })
  const ref = unwrapCreateResponse(response)
  return { ...ref, value: input.record }
}

async function getRecord<T>({
  repo,
  collection,
  rkey,
  slingshoturl,
}: {
  repo: string
  collection: string
  rkey: string
  slingshoturl?: string
}) {
  const atUri = `at://${repo}/${collection}/${rkey}`
  const uriParams = new URLSearchParams({ at_uri: atUri })
  const host = slingshoturl || 'slingshot.microcosm.blue'
  const response = await fetch(
    serviceUrl(host, `/xrpc/com.bad-example.repo.getUriRecord?${uriParams.toString()}`),
  )
  if (response.ok) return response.json() as Promise<ForumRecord<T>>
  throw new Error(`Failed to load record from Slingshot: ${response.status}`)
}

async function listRemoteRecordsForSubject<T>({
  target,
  collection,
  path,
  constellation,
  slingshoturl = 'slingshot.microcosm.blue',
}: {
  target: string
  collection: string
  path: string
  constellation: string
  slingshoturl?: string
}) {
  const links = await listBacklinkRefs({ target, collection, path, constellation })
  const fetched = await Promise.all(
    links.map((record) =>
      getRecord<T>({
        repo: record.did,
        collection: record.collection,
        rkey: record.rkey,
        slingshoturl,
      }).catch(() => null),
    ),
  )
  return fetched.filter((record): record is ForumRecord<T> => !!record)
}

async function listBacklinkRefs({
  target,
  collection,
  path,
  constellation,
}: {
  target: string
  collection: string
  path: string
  constellation: string
}) {
  const xrpcParams = new URLSearchParams({
    subject: target,
    source: collection,
    path,
  })
  const xrpc = await fetch(
    serviceUrl(constellation, `/xrpc/blue.microcosm.links.getBacklinks?${xrpcParams.toString()}`),
  )
  if (xrpc.ok) {
    const data = await xrpc.json().catch(() => null)
    const refs = normalizeBacklinkRefs(data)
    if (refs.length > 0) return refs
  }

  const params = new URLSearchParams({ target, collection, path })
  const response = await fetch(serviceUrl(constellation, `/links?${params.toString()}`))
  if (!response.ok) return []
  const data = await response.json().catch(() => null)
  return normalizeBacklinkRefs(data)
}

function normalizeBacklinkRefs(data: unknown) {
  if (!data || typeof data !== 'object') return []
  const source = data as {
    linking_records?: unknown[]
    backlinks?: unknown[]
    records?: unknown[]
  }
  const records = source.linking_records ?? source.backlinks ?? source.records ?? []
  return records
    .map((record) => {
      if (!record || typeof record !== 'object') return null
      const value = record as {
        did?: unknown
        repo?: unknown
        collection?: unknown
        rkey?: unknown
        uri?: unknown
      }
      if (
        typeof value.did === 'string' &&
        typeof value.collection === 'string' &&
        typeof value.rkey === 'string'
      ) {
        return { did: value.did, collection: value.collection, rkey: value.rkey }
      }
      if (
        typeof value.repo === 'string' &&
        typeof value.collection === 'string' &&
        typeof value.rkey === 'string'
      ) {
        return { did: value.repo, collection: value.collection, rkey: value.rkey }
      }
      if (typeof value.uri === 'string') {
        const parsed = parseAtUri(value.uri)
        if (parsed) return parsed
      }
      return null
    })
    .filter((record): record is { did: string; collection: string; rkey: string } => !!record)
}

function serviceUrl(host: string, path: string) {
  const base =
    host.startsWith('http://') || host.startsWith('https://')
      ? host.replace(/\/+$/g, '')
      : `https://${host}`
  return `${base}${path}`
}

function requireConstellation(constellation?: string) {
  if (!constellation) {
    throw new Error('Constellation is required for meetup discovery.')
  }
  return constellation
}

function requireRepoAgent(agent: Agent) {
  const repoAgent = agent as RepoAgent
  if (!repoAgent.did) throw new Error('Sign in before writing meetup records.')
  return repoAgent
}

function unwrapCreateResponse(
  response: { data?: CreateRecordResponse } & Partial<CreateRecordResponse>,
) {
  const data = response.data ?? response
  if (!data.uri || !data.cid) {
    throw new Error('ATProto write did not return a record ref.')
  }
  return { uri: data.uri, cid: data.cid }
}

function dedupeRecords<T>(records: ForumRecord<T>[]) {
  return Array.from(new Map(records.map((record) => [record.uri, record])).values())
}

async function listAgentRecords<T>(
  agent: RepoAgent,
  collection: string,
  cursor?: string,
): Promise<{ uri: string; cid?: string; value: T }[]> {
  if (!agent.com.atproto.repo.listRecords) return []
  const response = await agent.com.atproto.repo.listRecords({
    repo: agent.did!,
    collection,
    limit: 100,
    cursor,
  })
  const data = response.data as ListRecordsResponse<T>
  const next: { uri: string; cid?: string; value: T }[] = data.cursor
    ? await listAgentRecords<T>(agent, collection, data.cursor)
    : []
  return [...data.records, ...next]
}
