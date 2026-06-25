// deno-lint-ignore-file
/* eslint-disable */
// biome-ignore: needed import
import type { OneRouter } from 'one'

declare module 'one' {
  export namespace OneRouter {
    export interface __routes<T extends string = string> extends Record<string, unknown> {
      StaticRoutes: 
        | `/`
        | `/(app)`
        | `/(app)/home`
        | `/(app)/home/(tabs)`
        | `/(app)/home/(tabs)/forums`
        | `/(app)/home/(tabs)/forums/`
        | `/(app)/home/forums`
        | `/(app)/home/forums/`
        | `/(app)/home/settings`
        | `/(app)/home/settings/`
        | `/(app)/home/settings/blocked-users`
        | `/(app)/home/settings/edit-profile`
        | `/_sitemap`
        | `/home`
        | `/home/(tabs)`
        | `/home/(tabs)/forums`
        | `/home/(tabs)/forums/`
        | `/home/forums`
        | `/home/forums/`
        | `/home/settings`
        | `/home/settings/`
        | `/home/settings/blocked-users`
        | `/home/settings/edit-profile`
        | `/login`
        | `/register`
      DynamicRoutes: 
        | `/(app)/home/(tabs)/forums/${OneRouter.SingleRoutePart<T>}/${OneRouter.SingleRoutePart<T>}`
        | `/(app)/home/(tabs)/forums/${OneRouter.SingleRoutePart<T>}/${OneRouter.SingleRoutePart<T>}/topic/${OneRouter.SingleRoutePart<T>}/${OneRouter.SingleRoutePart<T>}`
        | `/(app)/home/forums/${OneRouter.SingleRoutePart<T>}/${OneRouter.SingleRoutePart<T>}`
        | `/(app)/home/forums/${OneRouter.SingleRoutePart<T>}/${OneRouter.SingleRoutePart<T>}/topic/${OneRouter.SingleRoutePart<T>}/${OneRouter.SingleRoutePart<T>}`
        | `/home/(tabs)/forums/${OneRouter.SingleRoutePart<T>}/${OneRouter.SingleRoutePart<T>}`
        | `/home/(tabs)/forums/${OneRouter.SingleRoutePart<T>}/${OneRouter.SingleRoutePart<T>}/topic/${OneRouter.SingleRoutePart<T>}/${OneRouter.SingleRoutePart<T>}`
        | `/home/forums/${OneRouter.SingleRoutePart<T>}/${OneRouter.SingleRoutePart<T>}`
        | `/home/forums/${OneRouter.SingleRoutePart<T>}/${OneRouter.SingleRoutePart<T>}/topic/${OneRouter.SingleRoutePart<T>}/${OneRouter.SingleRoutePart<T>}`
      DynamicRouteTemplate: 
        | `/(app)/home/(tabs)/forums/[boardDid]/[boardRkey]`
        | `/(app)/home/(tabs)/forums/[boardDid]/[boardRkey]/topic/[topicDid]/[topicRkey]`
        | `/(app)/home/forums/[boardDid]/[boardRkey]`
        | `/(app)/home/forums/[boardDid]/[boardRkey]/topic/[topicDid]/[topicRkey]`
        | `/home/(tabs)/forums/[boardDid]/[boardRkey]`
        | `/home/(tabs)/forums/[boardDid]/[boardRkey]/topic/[topicDid]/[topicRkey]`
        | `/home/forums/[boardDid]/[boardRkey]`
        | `/home/forums/[boardDid]/[boardRkey]/topic/[topicDid]/[topicRkey]`
      IsTyped: true
      RouteTypes: {
        '/(app)/home/(tabs)/forums/[boardDid]/[boardRkey]': RouteInfo<{ boardDid: string; boardRkey: string }>
        '/(app)/home/(tabs)/forums/[boardDid]/[boardRkey]/topic/[topicDid]/[topicRkey]': RouteInfo<{ boardDid: string; boardRkey: string; topicDid: string; topicRkey: string }>
        '/(app)/home/forums/[boardDid]/[boardRkey]': RouteInfo<{ boardDid: string; boardRkey: string }>
        '/(app)/home/forums/[boardDid]/[boardRkey]/topic/[topicDid]/[topicRkey]': RouteInfo<{ boardDid: string; boardRkey: string; topicDid: string; topicRkey: string }>
        '/home/(tabs)/forums/[boardDid]/[boardRkey]': RouteInfo<{ boardDid: string; boardRkey: string }>
        '/home/(tabs)/forums/[boardDid]/[boardRkey]/topic/[topicDid]/[topicRkey]': RouteInfo<{ boardDid: string; boardRkey: string; topicDid: string; topicRkey: string }>
        '/home/forums/[boardDid]/[boardRkey]': RouteInfo<{ boardDid: string; boardRkey: string }>
        '/home/forums/[boardDid]/[boardRkey]/topic/[topicDid]/[topicRkey]': RouteInfo<{ boardDid: string; boardRkey: string; topicDid: string; topicRkey: string }>
      }
    }
  }
}

/**
 * Helper type for route information
 */
type RouteInfo<Params = Record<string, never>> = {
  Params: Params
  LoaderProps: { path: string; search?: string; subdomain?: string; params: Params; request?: Request }
}