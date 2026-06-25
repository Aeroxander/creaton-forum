export type SiweChallenge = {
  siweMessage: string
}

export async function createSiweLoginChallenge(
  service: string,
  identifier: string,
): Promise<SiweChallenge> {
  const response = await fetch(`${service}/xrpc/com.atproto.server.createSIWELogin`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ identifier }),
  })

  if (!response.ok) {
    let message = `Failed to create SIWE login challenge (${response.status})`
    try {
      const body = await response.json()
      if (body?.message) message = body.message
    } catch {
      // keep the status-based message
    }
    throw new Error(message)
  }

  return response.json()
}

export async function createSiweRegistrationChallenge(
  service: string,
  evmAddress: string,
): Promise<SiweChallenge> {
  const response = await fetch(`${service}/xrpc/com.atproto.server.createSIWERegistration`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ evmAddress }),
  })

  if (!response.ok) {
    let message = `Failed to create SIWE registration challenge (${response.status})`
    try {
      const body = await response.json()
      if (body?.message) message = body.message
    } catch {
      // keep the status-based message
    }
    throw new Error(message)
  }

  return response.json()
}
