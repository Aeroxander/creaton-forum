import type { Agent } from "@atproto/api";
import type { DocumentPickerAsset } from "expo-document-picker";
import {
  uploadPackagedHlsToPds,
  type CreatonForumVideoAsset,
  type VideoUploadProgress,
} from "@creaton/forum-core";

import { packageVideoAsHls, type HlsPackagerProgress } from "./hlsPackager.native";

export type ForumVideoUploadProgress = HlsPackagerProgress | VideoUploadProgress;

export async function uploadForumVideoToPds(
  agent: Agent,
  asset: DocumentPickerAsset,
  options: {
    pdsUrl: string;
    onProgress?: (progress: ForumVideoUploadProgress) => void;
  },
): Promise<CreatonForumVideoAsset> {
  const bundle = await packageVideoAsHls(asset, (progress) => {
    options.onProgress?.(progress);
  });
  return uploadPackagedHlsToPds(agent, bundle, {
    pdsUrl: options.pdsUrl,
    onProgress: (progress: VideoUploadProgress) => {
      options.onProgress?.(progress);
    },
  });
}
