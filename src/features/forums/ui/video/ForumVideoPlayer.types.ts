import type { CreatonForumVideoAsset } from "@creaton/forum-core";

export type ForumVideoDecryptionKey = {
  key: Uint8Array;
  iv: Uint8Array;
};

export type ForumVideoPlayerProps = {
  playlistUrl: string | null;
  video?: CreatonForumVideoAsset;
  decryptionKey?: ForumVideoDecryptionKey;
  loadingMessage?: string;
  lockedMessage?: string;
};
