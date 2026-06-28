import { useQuery } from "@tanstack/react-query";

import { cacheDecryptedForumVideoPlaylist } from "./cacheDecryptedForumVideoPlaylist.native";

export function useDecryptedForumVideoPlaylist(input: {
  playlistUrl: string | null;
  key?: Uint8Array;
  iv?: Uint8Array;
  enabled: boolean;
}) {
  return useQuery({
    queryKey: ["forum-video-decrypted-playlist", input.playlistUrl, input.key, input.iv],
    queryFn: async () => {
      if (!input.playlistUrl || !input.key || !input.iv) {
        throw new Error("Missing encrypted video playback inputs.");
      }
      return cacheDecryptedForumVideoPlaylist({
        playlistUrl: input.playlistUrl,
        key: input.key,
        iv: input.iv,
      });
    },
    enabled: input.enabled && !!input.playlistUrl && !!input.key && !!input.iv,
    staleTime: 5 * 60 * 1000,
  });
}
