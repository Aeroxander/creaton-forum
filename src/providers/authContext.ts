import type { Agent } from '@atproto/api'
import { createContext, use, type ReactNode } from 'react'

export type AuthStatus = 'loading' | 'signedIn' | 'signedOut'
export type AuthMethod = 'password' | 'oauth' | 'siwe' | null

const AUTH_NOT_READY_MESSAGE = 'Auth is still initializing. Please try again in a moment.'

function authNotReady(): never {
  throw new Error(AUTH_NOT_READY_MESSAGE)
}

const authNotReadyLogin = async () => authNotReady()

export interface AuthContextValue {
  agent: Agent | null
  status: AuthStatus
  authMethod: AuthMethod
  authReady: boolean
  loginWithPassword: (user: string, password: string, service?: string) => Promise<void>
  loginWithOAuth: (handleOrPdsUrl: string) => Promise<void>
  loginWithSiwe: (
    identifier: string,
    siweSignature: string,
    service?: string,
  ) => Promise<void>
  registerWithSiwe: (
    handle: string,
    evmAddress: string,
    siweSignature: string,
    service?: string,
  ) => Promise<void>
  logout: () => Promise<void>
}

export const authLoadingStub: AuthContextValue = {
  agent: null,
  status: 'loading',
  authMethod: null,
  authReady: false,
  loginWithPassword: authNotReadyLogin,
  loginWithOAuth: authNotReadyLogin,
  loginWithSiwe: authNotReadyLogin,
  registerWithSiwe: authNotReadyLogin,
  logout: async () => {},
}

export const authSignedOutStub: AuthContextValue = {
  agent: null,
  status: 'signedOut',
  authMethod: null,
  authReady: false,
  loginWithPassword: authNotReadyLogin,
  loginWithOAuth: authNotReadyLogin,
  loginWithSiwe: authNotReadyLogin,
  registerWithSiwe: authNotReadyLogin,
  logout: async () => {},
}

export function hasStoredAuthSession() {
  if (typeof localStorage === 'undefined') return false
  return !!(localStorage.getItem('service') && localStorage.getItem('sess'))
}

export function authStubForBootstrap() {
  if (import.meta.env.SSR) return authLoadingStub
  return hasStoredAuthSession() ? authLoadingStub : authSignedOutStub
}

export const AuthContext = createContext<AuthContextValue>(authLoadingStub)

export const useAuth = () => use(AuthContext)

export type AuthProviderProps = { children: ReactNode }
