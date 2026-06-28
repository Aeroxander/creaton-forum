import {
  getForumVideoPlaylistUrl,
  isEncryptedForumVideo,
  type CreatonForumAccessPolicy,
  type CreatonForumEncryptedContentV3,
  type CreatonForumVideoAsset,
} from "@creaton/forum-core";
import { SizableText, YStack } from "tamagui";

import { useForumVideoKey } from "~/features/forums/useForumVideoKey";
import { useDecryptedForumVideoPlaylist } from "~/features/forums/video/useDecryptedForumVideoPlaylist";
import { isWeb } from "~/constants/platform";

import { ForumVideoPlayer } from "./ForumVideoPlayer";

export function ForumVideoAttachment({
  authorDid,
  video,
  pdsUrl,
  boardUri,
  recordUri,
  recordType,
  protectedBody,
  access,
}: {
  authorDid: string;
  video: CreatonForumVideoAsset;
  pdsUrl?: string;
  boardUri?: string;
  recordUri?: string;
  recordType?: "topic" | "comment";
  protectedBody?: CreatonForumEncryptedContentV3;
  access?: CreatonForumAccessPolicy;
}) {
  const playlistUrl = getForumVideoPlaylistUrl({
    authorDid,
    video,
    pdsUrl,
  });

  const encrypted = isEncryptedForumVideo(video.encryption);
  const unlockContextReady =
    encrypted && !!boardUri && !!recordUri && !!recordType && !!protectedBody && !!access;

  const videoKey = useForumVideoKey({
    video,
    boardUri: boardUri ?? "",
    recordUri: recordUri ?? "",
    recordType: recordType ?? "topic",
    protectedBody,
    access,
  });

  const decryptedPlaylist = useDecryptedForumVideoPlaylist({
    playlistUrl,
    key: videoKey.data?.key,
    iv: videoKey.data?.iv,
    enabled: encrypted && !isWeb && unlockContextReady && videoKey.isSuccess,
  });

  if (encrypted && !unlockContextReady) {
    return (
      <SizableText size="$2" opacity={0.6}>
        Encrypted video — unlock post to view
      </SizableText>
    );
  }

  if (encrypted && videoKey.isLoading) {
    return (
      <SizableText size="$2" opacity={0.6}>
        Unlocking video…
      </SizableText>
    );
  }

  if (encrypted && videoKey.isError) {
    return (
      <SizableText size="$2" opacity={0.6}>
        Encrypted video — unlock post to view
      </SizableText>
    );
  }

  if (encrypted && !isWeb && decryptedPlaylist.isLoading) {
    return (
      <YStack gap="$1">
        <SizableText size="$2" opacity={0.6}>
          Preparing encrypted video…
        </SizableText>
      </YStack>
    );
  }

  if (encrypted && !isWeb && decryptedPlaylist.isError) {
    return (
      <SizableText size="$2" opacity={0.6}>
        Could not prepare encrypted video for playback.
      </SizableText>
    );
  }

  const resolvedPlaylistUrl =
    encrypted && !isWeb ? (decryptedPlaylist.data ?? null) : playlistUrl;

  return (
    <ForumVideoPlayer
      playlistUrl={resolvedPlaylistUrl}
      video={video}
      decryptionKey={encrypted ? videoKey.data : undefined}
    />
  );
}
