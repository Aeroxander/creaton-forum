export function useDecryptedForumVideoPlaylist(_input: {
  playlistUrl: string | null;
  key?: Uint8Array;
  iv?: Uint8Array;
  enabled: boolean;
}) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    isSuccess: true,
  };
}
