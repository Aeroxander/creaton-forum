import type { CreatonForumVideoAsset } from "../forumTypes";
import { getAtprotoBlobCid, resolveAtprotoBlobUrl } from "./videoBlobUtils";

/** Resolve the master HLS playlist URL for playback. */
export function getForumVideoPlaylistUrl({
  authorDid,
  video,
  pdsUrl,
}: {
  authorDid: string | undefined;
  video: CreatonForumVideoAsset | undefined;
  pdsUrl: string | undefined;
}): string | null {
  return resolveAtprotoBlobUrl({
    did: authorDid,
    blob: video?.playlist,
    pdsUrl,
  });
}

/** Stable identifier for P2P swarms — playlist blob CID. */
export function getForumVideoSwarmId(video: CreatonForumVideoAsset | undefined): string | undefined {
  return getAtprotoBlobCid(video?.playlist);
}
