import { Agent, AtpAgent, type AtpSessionData } from '@atproto/api'
import type { OAuthSession } from '@atproto/oauth-client-browser'
import { useAtom } from 'jotai'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  AuthContext,
  type AuthMethod,
  type AuthProviderProps,
  type AuthStatus,
} from '~/providers/authContext'
import { DEFAULT_PDS_URL } from '~/constants/urls'
import { clearProfileKnownState } from '~/features/profile/profileUtils'
import { quickAuthAtom } from '~/utils/atoms'
import { createOAuthClient } from '~/utils/oauthClient'

const OAUTH_INIT_TIMEOUT_MS = 4_000
const AUTH_NOT_READY_MESSAGE = 'Auth is still initializing. Please try again in a moment.'

function getSessionStorage() {
  if (typeof localStorage === 'undefined') return null
  return localStorage
}

export function UnifiedAuthProviderClient({ children }: AuthProviderProps) {
  const [agent, setAgent] = useState<Agent | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [authMethod, setAuthMethod] = useState<AuthMethod>(null)
  const [oauthSession, setOauthSession] = useState<OAuthSession | null>(null)
  const [, setQuickAuth] = useAtom(quickAuthAtom)

  const statusRef = useRef(status)
  statusRef.current = status

  const initPromiseRef = useRef<Promise<void> | null>(null)

  const authStateRef = useRef({
    setAgent,
    setOauthSession,
    setAuthMethod,
    setStatus,
    setQuickAuth,
  })
  authStateRef.current = {
    setAgent,
    setOauthSession,
    setAuthMethod,
    setStatus,
    setQuickAuth,
  }

  const oauthClient = useMemo(
    () =>
      createOAuthClient({
        onDelete: (sub, cause) => {
          console.error(`OAuth session for ${sub} was deleted.`, cause)
          const state = authStateRef.current
          state.setAgent(null)
          state.setOauthSession(null)
          state.setAuthMethod(null)
          state.setStatus('signedOut')
          state.setQuickAuth(null)
        },
      }),
    [],
  )

  const initialize = useCallback(async () => {
    const storage = getSessionStorage()

    try {
      const oauthResult = await Promise.race([
        oauthClient.init(),
        new Promise<null>((resolve) => {
          setTimeout(() => resolve(null), OAUTH_INIT_TIMEOUT_MS)
        }),
      ])
      if (oauthResult) {
        const apiAgent = new Agent(oauthResult.session)
        setAgent(apiAgent)
        setOauthSession(oauthResult.session)
        setAuthMethod('oauth')
        setStatus('signedIn')
        setQuickAuth(apiAgent?.did || null)
        return
      }
    } catch (e) {
      console.error('OAuth init failed, checking password session.', e)
    }

    try {
      const service = storage?.getItem('service')
      const sessionString = storage?.getItem('sess')

      if (service && sessionString) {
        const apiAgent = new AtpAgent({ service })
        const session: AtpSessionData = JSON.parse(sessionString)
        await apiAgent.resumeSession(session)

        const storedAuthMethod = storage?.getItem('authMethod')
        const restoredMethod: AuthMethod =
          storedAuthMethod === 'siwe' ? 'siwe' : 'password'

        setAgent(apiAgent)
        setAuthMethod(restoredMethod)
        setStatus('signedIn')
        setQuickAuth(apiAgent?.did || null)
        return
      }
    } catch (e) {
      console.error('Failed to resume password-based session.', e)
      storage?.removeItem('sess')
      storage?.removeItem('service')
    }

    setStatus('signedOut')
    setAgent(null)
    setAuthMethod(null)
    setQuickAuth(null)
  }, [oauthClient, setQuickAuth])

  const ensureReadyForLogin = useCallback(async () => {
    if (!initPromiseRef.current) {
      initPromiseRef.current = initialize()
    }
    await initPromiseRef.current

    const currentStatus = statusRef.current
    if (currentStatus === 'signedIn') return 'signedIn' as const
    if (currentStatus !== 'signedOut') {
      throw new Error(AUTH_NOT_READY_MESSAGE)
    }
    return 'signedOut' as const
  }, [initialize])

  useEffect(() => {
    if (!initPromiseRef.current) {
      initPromiseRef.current = initialize()
    }
  }, [initialize])

  const loginWithPassword = async (
    user: string,
    password: string,
    service: string = 'https://bsky.social',
  ) => {
    const ready = await ensureReadyForLogin()
    if (ready === 'signedIn') return

    setStatus('loading')
    const storage = getSessionStorage()
    try {
      let sessionData: AtpSessionData | undefined
      const apiAgent = new AtpAgent({
        service,
        persistSession: (_evt, sess) => {
          sessionData = sess
        },
      })
      await apiAgent.login({ identifier: user, password })

      if (sessionData) {
        storage?.setItem('service', service)
        storage?.setItem('sess', JSON.stringify(sessionData))
        setAgent(apiAgent)
        setAuthMethod('password')
        setStatus('signedIn')
        setQuickAuth(apiAgent?.did || null)
      } else {
        throw new Error('Session data not persisted after login.')
      }
    } catch (e) {
      console.error('Password login failed:', e)
      setStatus('signedOut')
      setQuickAuth(null)
      throw e
    }
  }

  const loginWithOAuth = useCallback(
    async (handleOrPdsUrl: string) => {
      const ready = await ensureReadyForLogin()
      if (ready === 'signedIn') return

      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem(
            'postLoginRedirect',
            window.location.pathname + window.location.search,
          )
        }
        await oauthClient.signIn(handleOrPdsUrl)
      } catch (err) {
        console.error('OAuth sign-in aborted or failed:', err)
      }
    },
    [ensureReadyForLogin, oauthClient],
  )

  const loginWithSiwe = useCallback(
    async (
      identifier: string,
      siweSignature: string,
      service: string = DEFAULT_PDS_URL,
    ) => {
      const ready = await ensureReadyForLogin()
      if (ready === 'signedIn') return

      setStatus('loading')
      const storage = getSessionStorage()
      try {
        const apiAgent = new AtpAgent({ service })
        const server = apiAgent.com.atproto.server as unknown as {
          createSession: (data: {
            identifier: string
            siweSignature: string
          }) => Promise<{ data: AtpSessionData }>
        }
        const res = await server.createSession({
          identifier,
          siweSignature,
        })

        const session = res.data
        storage?.setItem('service', service)
        storage?.setItem('sess', JSON.stringify(session))
        storage?.setItem('authMethod', 'siwe')

        await apiAgent.resumeSession(session)
        setAgent(apiAgent)
        setAuthMethod('siwe')
        setStatus('signedIn')
        setQuickAuth(apiAgent?.did || null)
        storage?.setItem('lastHandle', identifier)
      } catch (e) {
        console.error('SIWE login failed:', e)
        storage?.removeItem('sess')
        storage?.removeItem('service')
        setStatus('signedOut')
        setQuickAuth(null)
        throw e
      }
    },
    [ensureReadyForLogin, setQuickAuth],
  )

  const registerWithSiwe = useCallback(
    async (
      handle: string,
      evmAddress: string,
      siweSignature: string,
      service: string = DEFAULT_PDS_URL,
    ) => {
      const ready = await ensureReadyForLogin()
      if (ready === 'signedIn') return

      setStatus('loading')
      const storage = getSessionStorage()
      try {
        const apiAgent = new AtpAgent({ service })
        const server = apiAgent.com.atproto.server as unknown as {
          createAccount: (data: {
            handle: string
            evmAddress: string
            siweSignature: string
          }) => Promise<{ data: AtpSessionData }>
        }
        const res = await server.createAccount({
          handle,
          evmAddress,
          siweSignature,
        })

        const session = res.data
        storage?.setItem('service', service)
        storage?.setItem('sess', JSON.stringify(session))
        storage?.setItem('authMethod', 'siwe')

        await apiAgent.resumeSession(session)
        setAgent(apiAgent)
        setAuthMethod('siwe')
        setStatus('signedIn')
        setQuickAuth(apiAgent?.did || null)
        storage?.setItem('lastHandle', handle)
      } catch (e) {
        console.error('SIWE registration failed:', e)
        storage?.removeItem('sess')
        storage?.removeItem('service')
        setStatus('signedOut')
        setQuickAuth(null)
        throw e
      }
    },
    [ensureReadyForLogin, setQuickAuth],
  )

  const logout = useCallback(async () => {
    if (status !== 'signedIn' || !agent) return
    setStatus('loading')
    const storage = getSessionStorage()

    try {
      if (authMethod === 'oauth' && oauthSession) {
        await oauthClient.revoke(oauthSession.sub)
      } else if (authMethod === 'password' || authMethod === 'siwe') {
        storage?.removeItem('service')
        storage?.removeItem('sess')
        storage?.removeItem('authMethod')
        await (agent as AtpAgent).com.atproto.server.deleteSession()
      }
    } catch (e) {
      console.error('Logout failed:', e)
    } finally {
      if (agent?.did) clearProfileKnownState(agent.did)
      setAgent(null)
      setAuthMethod(null)
      setOauthSession(null)
      setStatus('signedOut')
      setQuickAuth(null)
    }
  }, [status, agent, authMethod, oauthClient, oauthSession, setQuickAuth])

  return (
    <AuthContext
      value={{
        agent,
        status,
        authMethod,
        authReady: true,
        loginWithPassword,
        loginWithOAuth,
        loginWithSiwe,
        registerWithSiwe,
        logout,
      }}
    >
      {children}
    </AuthContext>
  )
}
