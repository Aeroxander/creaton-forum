export type LogosUploadResult = {
  manifestUri: string
  treeCid: string
  ciphertextHash: string
}

export type LogosStorageClient = {
  uploadEncryptedBlob(ciphertext: Uint8Array): Promise<LogosUploadResult>
  fetchEncryptedBlob(manifestUri: string): Promise<Uint8Array>
  health(): Promise<{ status: string; logosReady: boolean }>
}

export function createLogosStorageClient(baseUrl: string): LogosStorageClient {
  const normalized = baseUrl.replace(/\/$/, '')

  return {
    async uploadEncryptedBlob(ciphertext) {
      const response = await fetch(`${normalized}/v1/blobs/upload`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ciphertext: bytesToBase64Url(ciphertext),
        }),
      })
      if (!response.ok) {
        const body = await response.text().catch(() => `HTTP ${response.status}`)
        throw new Error(`Logos upload failed: ${body}`)
      }
      const data = (await response.json()) as {
        manifestUri: string
        treeCid: string
        ciphertextHash: string
      }
      return data
    },

    async fetchEncryptedBlob(manifestUri) {
      const encoded = encodeURIComponent(manifestUri)
      const response = await fetch(`${normalized}/v1/blobs/${encoded}`)
      if (!response.ok) {
        const body = await response.text().catch(() => `HTTP ${response.status}`)
        throw new Error(`Logos fetch failed: ${body}`)
      }
      return new Uint8Array(await response.arrayBuffer())
    },

    async health() {
      const response = await fetch(`${normalized}/health`)
      if (!response.ok) throw new Error(`forum-storage health check failed (${response.status})`)
      const data = (await response.json()) as { status: string; logosReady: boolean }
      return data
    },
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}
