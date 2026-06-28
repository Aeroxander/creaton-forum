import { getDkgServiceUrl, isProductionForumCrypto } from '~/features/forums/crypto/forumCryptoMode'

export async function provisionDevBoardDkgKey(
  boardId: string,
  participantId: string,
): Promise<void> {
  if (isProductionForumCrypto()) return
  if (!participantId) {
    throw new Error('Sign in before provisioning an encrypted board.')
  }

  const baseUrl = getDkgServiceUrl()
  let response: Response
  try {
    response = await fetch(`${baseUrl}/v1/boards/${encodeURIComponent(boardId)}/key`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer dev-kms-admin',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        participants: [{ id: participantId, publicKey: `${participantId}-dev` }],
        threshold: 1,
      }),
    })
  } catch {
    throw new Error(
      `DKG service is not reachable at ${baseUrl}. Start it in another terminal with: bun dev:dkg`,
    )
  }
  if (!response.ok) {
    const body = await response.text().catch(() => `HTTP ${response.status}`)
    throw new Error(`DKG board provisioning failed: ${body}`)
  }
}

export function boardIdFromUri(boardUri: string): string {
  const match = boardUri.match(/^at:\/\/[^/]+\/[^/]+\/([^/]+)$/)
  if (match?.[1]) return match[1]
  return boardUri
}
