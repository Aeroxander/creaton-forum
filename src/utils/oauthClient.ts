import { BrowserOAuthClient, type ClientMetadata } from '@atproto/oauth-client-browser'
import type { SessionHooks } from '@atproto/oauth-client'

import clientMetadata from '~/config/client-metadata.json'
import resolvers from '~/config/resolvers.json'

const handleResolverPDS = resolvers.resolver || 'https://bsky.social'

export function createOAuthClient(hooks: SessionHooks = {}) {
  return new BrowserOAuthClient({
    clientMetadata: clientMetadata as ClientMetadata,
    handleResolver: handleResolverPDS,
    ...hooks,
  })
}
