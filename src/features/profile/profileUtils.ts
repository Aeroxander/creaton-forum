import type { Agent, AppBskyActorProfile } from '@atproto/api'
import type { AtpAgent } from '@atproto/api'

import { DEFAULT_PDS_URL } from '~/constants/urls'
import { shortDid } from '~/utils/shortDid'

export const PROFILE_COLLECTION = 'app.bsky.actor.profile'
export const PROFILE_RKEY = 'self'

export type ProfileRecord = {
  uri: string
  cid: string
  value: AppBskyActorProfile.Record
}

export type IdentityRecord = {
  did: string
  handle: string
  pds: string
  signing_key: string
}

type AtUriParts = {
  repo: string
  collection: string
  rkey: string
}

export function profileUriFromDid(did: string) {
  return `at://${did}/${PROFILE_COLLECTION}/${PROFILE_RKEY}`
}

export function buildServiceUrl(host: string, path: string) {
  const base = host.replace(/\/$/, '')
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

function normalizeServiceUrl(url: string | URL | undefined): string | undefined {
  if (!url) return undefined
  return String(url).replace(/\/$/, '')
}

export function getAgentPdsUrl(agent?: Agent | null): string | undefined {
  if (!agent) return undefined

  const atpAgent = agent as AtpAgent
  const fromPds = normalizeServiceUrl(atpAgent.pdsUrl)
  if (fromPds) return fromPds
  const fromService = normalizeServiceUrl(atpAgent.serviceUrl)
  if (fromService) return fromService

  const sessionManager = agent.sessionManager as {
    pdsUrl?: URL
    serviceUrl?: URL
    server?: { issuer?: string }
  }
  const fromSessionPds = normalizeServiceUrl(sessionManager.pdsUrl)
  if (fromSessionPds) return fromSessionPds
  const fromSessionService = normalizeServiceUrl(sessionManager.serviceUrl)
  if (fromSessionService) return fromSessionService
  if (sessionManager.server?.issuer) {
    return normalizeServiceUrl(sessionManager.server.issuer)
  }

  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('service')
    if (stored) return normalizeServiceUrl(stored)
  }

  return undefined
}

export function resolveProfilePdsUrl({
  identityPds,
  agent,
  did,
}: {
  identityPds?: string
  agent?: Agent | null
  did?: string
}): string | undefined {
  if (import.meta.env.DEV && agent?.did && did && agent.did === did) {
    return getAgentPdsUrl(agent) ?? DEFAULT_PDS_URL
  }
  if (identityPds) return normalizeServiceUrl(identityPds)
  if (agent?.did && did && agent.did === did) {
    return getAgentPdsUrl(agent)
  }
  return import.meta.env.DEV ? DEFAULT_PDS_URL : undefined
}

function parseAtUri(uri: string): AtUriParts | null {
  const match = uri.match(/^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/)
  if (!match) return null
  return { repo: match[1]!, collection: match[2]!, rkey: match[3]! }
}

export async function fetchLocalAtUriRecord<T>(
  uri: string,
  agent?: Agent | null,
): Promise<{ uri: string; cid: string; value: T } | null> {
  const parsed = parseAtUri(uri)
  if (!import.meta.env.DEV || !parsed || agent?.did !== parsed.repo) return null

  const pdsUrl = getAgentPdsUrl(agent)
  if (!pdsUrl) return null

  try {
    const params = new URLSearchParams({
      repo: parsed.repo,
      collection: parsed.collection,
      rkey: parsed.rkey,
    })
    const response = await fetch(
      `${pdsUrl.replace(/\/$/, '')}/xrpc/com.atproto.repo.getRecord?${params.toString()}`,
    )
    if (!response.ok) return null
    return (await response.json()) as { uri: string; cid: string; value: T }
  } catch {
    return null
  }
}

export function isOwnProfileDid(agent: Agent | null | undefined, did: string | undefined) {
  return !!agent?.did && !!did && agent.did === did
}

type ProfileKnownState = 'unknown' | 'missing' | 'exists'

function profileKnownKey(did: string) {
  return `creaton-forum:profile-known:${did}`
}

export function getProfileKnownState(did: string | undefined): ProfileKnownState {
  if (!did || typeof localStorage === 'undefined') return 'unknown'
  const value = localStorage.getItem(profileKnownKey(did))
  if (value === 'exists' || value === 'missing') return value
  return 'unknown'
}

export function markProfileKnownState(did: string, state: Exclude<ProfileKnownState, 'unknown'>) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(profileKnownKey(did), state)
}

export function clearProfileKnownState(did: string) {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(profileKnownKey(did))
}

export function shouldFetchProfileRecord(
  agent: Agent | null | undefined,
  did: string | undefined,
  mode: 'display' | 'edit' = 'display',
) {
  if (!did) return false
  if (mode === 'edit') return true
  if (!isOwnProfileDid(agent, did)) return true

  const known = getProfileKnownState(did)
  if (import.meta.env.DEV) {
    return known === 'exists'
  }
  return true
}

export function getProfileImageCid(
  blob: AppBskyActorProfile.Record['avatar'] | undefined,
): string | undefined {
  if (!blob) return undefined

  const maybeJson = blob as {
    toJSON?: () => { ref?: { $link?: string } }
  }
  if (typeof maybeJson.toJSON === 'function') {
    try {
      const link = maybeJson.toJSON().ref?.$link
      if (link) return link
    } catch {
      // fall through
    }
  }

  const ref = blob.ref as
    | { $link?: string; ['$link']?: string; toString?: () => string }
    | undefined
  const jsonLink = ref?.['$link'] ?? ref?.$link
  if (jsonLink) return jsonLink

  if (ref && typeof ref.toString === 'function') {
    const cid = ref.toString()
    if (cid.startsWith('baf')) return cid
  }

  return undefined
}

export function getProfileAvatarUrl({
  did,
  blob,
  pdsUrl,
}: {
  did: string | undefined
  blob: AppBskyActorProfile.Record['avatar'] | undefined
  pdsUrl?: string
}) {
  const link = getProfileImageCid(blob)
  if (!did || !link) return null
  const pds = pdsUrl ?? (import.meta.env.DEV ? DEFAULT_PDS_URL : undefined)
  if (!pds) return null
  return `${pds.replace(/\/$/, '')}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(link)}`
}

export function profileDisplayName({
  profile,
  identity,
  did,
}: {
  profile?: AppBskyActorProfile.Record | null
  identity?: IdentityRecord | null
  did: string
}) {
  return profile?.displayName || identity?.handle || shortDid(did)
}

export function profileHandleLabel({
  identity,
  did,
}: {
  identity?: IdentityRecord | null
  did: string
}) {
  const handle = identity?.handle
  if (!handle || handle === did) return shortDid(did)
  return handle.startsWith('@') ? handle : `@${handle}`
}

type LocalIdentity = {
  did: string
  handle: string
  pds: string
  signing_key: string
  aliases: string[]
}

function currentServiceUrl() {
  if (typeof localStorage === 'undefined') return ''
  return localStorage.getItem('service') ?? ''
}

export function localIdentityForAgent(agent?: Agent | null): LocalIdentity | undefined {
  const did = agent?.did
  if (!import.meta.env.DEV || !did) return undefined

  const maybeAgent = agent as Agent & {
    session?: { handle?: string }
  }
  const handle =
    maybeAgent.session?.handle ??
    (typeof localStorage === 'undefined' ? null : localStorage.getItem('lastHandle')) ??
    did
  const pds = getAgentPdsUrl(agent) ?? currentServiceUrl() ?? DEFAULT_PDS_URL

  return {
    did,
    handle,
    pds,
    signing_key: '',
    aliases: [did, handle].filter(Boolean),
  }
}

export function matchesLocalIdentity(
  identifier: string | undefined,
  identity: LocalIdentity | undefined,
) {
  if (!identifier || !identity) return false
  return identity.aliases.some((alias) => alias.toLowerCase() === identifier.toLowerCase())
}
