import { useEffect, useRef } from "react";
import Hls from "hls.js";
import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";
import { Plyr, type APITypes } from "plyr-react";
import "plyr-react/plyr.css";
import { YStack } from "tamagui";

import { FORUM_VIDEO_KEY_URI, getForumVideoSwarmId } from "@creaton/forum-core";

import { getForumVideoAspectRatio } from "~/features/forums/video/forumVideoLimits";

import type { ForumVideoPlayerProps } from "./ForumVideoPlayer.types";

const HlsWithP2P = HlsJsP2PEngine.injectMixin(Hls);

type PlyrWithMedia = {
  media?: HTMLVideoElement | null;
  on: (event: string, callback: () => void) => void;
  off: (event: string, callback: () => void) => void;
};

function createCreatonHlsLoader(key: Uint8Array) {
  const DefaultLoader = Hls.DefaultConfig.loader as new (
    ...args: ConstructorParameters<typeof Hls.DefaultConfig.loader>
  ) => InstanceType<typeof Hls.DefaultConfig.loader>;

  return class CreatonForumHlsLoader extends DefaultLoader {
    load(
      context: Parameters<InstanceType<typeof DefaultLoader>["load"]>[0],
      config: Parameters<InstanceType<typeof DefaultLoader>["load"]>[1],
      callbacks: Parameters<InstanceType<typeof DefaultLoader>["load"]>[2],
    ) {
      if (context.url === FORUM_VIDEO_KEY_URI) {
        callbacks.onSuccess(
          {
            url: context.url,
            data: key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength),
          },
          { code: 200, text: "OK" },
          context,
          null,
        );
        return;
      }
      super.load(context, config, callbacks);
    }
  };
}

export function ForumVideoPlayer({
  playlistUrl,
  video,
  decryptionKey,
}: ForumVideoPlayerProps) {
  const plyrRef = useRef<APITypes>(null);
  const hlsRef = useRef<InstanceType<typeof HlsWithP2P> | null>(null);

  useEffect(() => {
    if (!playlistUrl) return;
    if (decryptionKey && !decryptionKey.key.byteLength) return;

    const attach = () => {
      const player = plyrRef.current?.plyr as PlyrWithMedia | undefined;
      const media = player?.media;
      if (!(media instanceof HTMLVideoElement)) return;

      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      if (!Hls.isSupported()) {
        if (media.canPlayType("application/vnd.apple.mpegurl")) {
          media.src = playlistUrl;
        }
        return;
      }

      const swarmId = getForumVideoSwarmId(video) ?? playlistUrl;
      const hls = new HlsWithP2P({
        loader: decryptionKey ? createCreatonHlsLoader(decryptionKey.key) : undefined,
        p2p: {
          core: {
            swarmId,
            simultaneousHttpDownloads: 3,
            httpDownloadInitialTimeoutMs: 0,
            httpDownloadProbability: 1,
          },
        },
      });

      hlsRef.current = hls;
      hls.attachMedia(media);
      hls.loadSource(playlistUrl);
    };

    const player = plyrRef.current?.plyr as PlyrWithMedia | undefined;
    if (player?.media) {
      attach();
      return () => {
        hlsRef.current?.destroy();
        hlsRef.current = null;
      };
    }

    const onReady = () => attach();
    player?.on("ready", onReady);

    return () => {
      player?.off("ready", onReady);
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [playlistUrl, video, decryptionKey]);

  if (!playlistUrl) return null;

  const aspectRatio = getForumVideoAspectRatio(video);

  return (
    <YStack width="100%" maxW={640} aspectRatio={aspectRatio} rounded="$3" overflow="hidden">
      <Plyr
        ref={plyrRef}
        source={{
          type: "video",
          sources: [{ src: playlistUrl, type: "application/x-mpegURL" }],
        }}
        options={{
          controls: [
            "play-large",
            "play",
            "progress",
            "current-time",
            "mute",
            "volume",
            "settings",
            "pip",
            "airplay",
            "fullscreen",
          ],
        }}
      />
    </YStack>
  );
}
