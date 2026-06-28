import Video from "react-native-video";
import { YStack } from "tamagui";

import { getForumVideoAspectRatio } from "~/features/forums/video/forumVideoLimits";

import type { ForumVideoPlayerProps } from "./ForumVideoPlayer.types";

export function ForumVideoPlayer({ playlistUrl, video }: ForumVideoPlayerProps) {
  if (!playlistUrl) return null;

  const aspectRatio = getForumVideoAspectRatio(video);

  return (
    <YStack
      width="100%"
      maxW={640}
      aspectRatio={aspectRatio}
      rounded="$3"
      overflow="hidden"
      bg="$color3"
    >
      <Video
        source={{ uri: playlistUrl, type: "application/x-mpegURL" }}
        style={{ width: "100%", height: "100%" }}
        controls
        resizeMode="contain"
        paused
      />
    </YStack>
  );
}
