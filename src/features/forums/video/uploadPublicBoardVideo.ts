import type { Agent } from "@atproto/api";
import type { DocumentPickerAsset } from "expo-document-picker";
import type { CreatonForumVideoAsset } from "@creaton/forum-core";

import { isWeb } from "~/constants/platform";

import { formatForumVideoUploadStatus } from "./forumVideoUploadStatus";

export async function uploadPublicBoardVideo(
  agent: Agent,
  source: File | DocumentPickerAsset,
  pdsUrl: string,
  onStatus?: (message: string) => void,
): Promise<CreatonForumVideoAsset> {
  const options = {
    pdsUrl,
    onProgress: (progress: Parameters<typeof formatForumVideoUploadStatus>[0]) => {
      onStatus?.(formatForumVideoUploadStatus(progress));
    },
  };

  if (isWeb) {
    const { uploadForumVideoToPds } = await import("./uploadForumVideo.web");
    if (!(source instanceof File)) {
      throw new Error("Expected a video file.");
    }
    return uploadForumVideoToPds(agent, source, options);
  }

  const { uploadForumVideoToPds } = await import("./uploadForumVideo.native");
  return uploadForumVideoToPds(agent, source as DocumentPickerAsset, options);
}
