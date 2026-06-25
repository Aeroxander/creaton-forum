import { getURL } from 'one'

const rawServerUrl = process.env.ONE_SERVER_URL || 'http://localhost:8092'

export const SERVER_URL = (() => {
  if (typeof location !== 'undefined') {
    return `${location.protocol}//${location.host}`
  }

  let url = getURL()

  if (url === 'http://one-server.example.com') {
    url = process.env.VITE_SERVER || 'https://forum.creaton.social'
  }
  return url
})()

export const DEFAULT_HOT_UPDATE_SERVER_URL =
  'https://pckjvzbtdczlpkgujgkb.supabase.co/functions/v1/update-server'

export const API_URL = `${SERVER_URL}/api`

export const DEFAULT_CONSTELLATION_URL = import.meta.env.DEV
  ? 'http://localhost:6789'
  : 'https://constellation.microcosm.blue'

export const DEFAULT_SLINGSHOT_URL = import.meta.env.DEV
  ? 'http://localhost:8080'
  : 'https://slingshot.microcosm.blue'

export const DEFAULT_PDS_URL =
  import.meta.env.VITE_CREATON_PDS_URL || 'http://127.0.0.1:2583'
