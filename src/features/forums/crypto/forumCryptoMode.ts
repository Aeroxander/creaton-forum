export type ForumCryptoMode = 'dev' | 'production'

export function getForumCryptoMode(): ForumCryptoMode {
  const mode = import.meta.env.VITE_FORUM_CRYPTO_MODE
  return mode === 'production' ? 'production' : 'dev'
}

export function isProductionForumCrypto(): boolean {
  return getForumCryptoMode() === 'production'
}

export function getDkgServiceUrl(): string {
  return import.meta.env.VITE_DKG_SERVICE_URL || 'http://localhost:3021'
}

export function getForumStorageUrl(): string {
  return import.meta.env.VITE_FORUM_STORAGE_URL || 'http://localhost:3022'
}
