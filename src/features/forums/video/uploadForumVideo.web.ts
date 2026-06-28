import type { Agent } from "@atproto/api";
import {
  uploadPackagedHlsToPds,
  type CreatonForumVideoAsset,
  type VideoUploadProgress,
} from "@creaton/forum-core";

import { packageVideoAsHls, type HlsPackagerProgress } from "./hlsPackager.web";

export type ForumVideoUploadProgress = HlsPackagerProgress | VideoUploadProgress;

export async function uploadForumVideoToPds(
  agent: Agent,
  file: File,
  options: {
    pdsUrl: string;
    onProgress?: (progress: ForumVideoUploadProgress) => void;
  },
): Promise<CreatonForumVideoAsset> {
  const bundle = await packageVideoAsHls(file, (progress) => {
    options.onProgress?.(progress);
  });
  return uploadPackagedHlsToPds(agent, bundle, {
    pdsUrl: options.pdsUrl,
    onProgress: (progress: VideoUploadProgress) => {
      options.onProgress?.(progress);
    },
  });
}
