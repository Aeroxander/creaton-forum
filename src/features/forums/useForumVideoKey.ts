import { useQuery } from "@tanstack/react-query";

import {
  isEncryptedForumVideo,
  unwrapForumVideoKey,
  type CreatonForumAccessPolicy,
  type CreatonForumEncryptedContentV3,
  type CreatonForumVideoAsset,
} from "@creaton/forum-core";

import { useForumUnlock } from "~/features/forums/useForumUnlock";

export function useForumVideoKey({
  video,
  boardUri,
  recordUri,
  recordType,
  protectedBody,
  access,
}: {
  video: CreatonForumVideoAsset;
  boardUri: string;
  recordUri: string;
  recordType: "topic" | "comment";
  protectedBody?: CreatonForumEncryptedContentV3;
  access?: CreatonForumAccessPolicy;
}) {
  const { getEpochKey } = useForumUnlock(boardUri);
  const encrypted = isEncryptedForumVideo(video.encryption);

  return useQuery({
    queryKey: ["forum-video-key", video.encryption?.keyEpochUri, recordUri, boardUri],
    queryFn: async () => {
      if (!encrypted || !protectedBody || !access || !video.encryption) {
        throw new Error("Encrypted video requires board unlock context.");
      }
      const epochKey = await getEpochKey({
        boardUri,
        recordUri,
        recordType,
        protectedBody,
        access,
      });
      return unwrapForumVideoKey(video.encryption, epochKey);
    },
    enabled: encrypted && !!protectedBody && !!access,
    staleTime: 5 * 60 * 1000,
  });
}
