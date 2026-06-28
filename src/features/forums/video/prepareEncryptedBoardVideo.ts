import type { DocumentPickerAsset } from "expo-document-picker";
import type { Agent } from "@atproto/api";
import type { VideoUploadProgress } from "@creaton/forum-core";

import { isWeb } from "~/constants/platform";

import { formatForumVideoUploadStatus } from "./forumVideoUploadStatus";
import { packageVideoAsHls } from "./hlsPackager";

export type ProtectedBoardVideoSource = File | DocumentPickerAsset;

export async function prepareEncryptedBoardVideoBundle(
  source: ProtectedBoardVideoSource,
  onStatus?: (message: string) => void,
) {
  const onProgress = (progress: { phase: "packaging"; progress: number }) => {
    onStatus?.(formatForumVideoUploadStatus(progress));
  };

  if (isWeb) {
    if (!(source instanceof File)) {
      throw new Error("Expected a video file.");
    }
    return packageVideoAsHls(source, onProgress);
  }

  return packageVideoAsHls(source as DocumentPickerAsset, onProgress);
}

export function formatEncryptedVideoUploadStatus(progress: VideoUploadProgress): string {
  if (progress.phase === "uploading-segments") {
    return `Encrypting & uploading segments… ${progress.completed}/${progress.total}`;
  }
  if (progress.phase === "uploading-playlists") {
    return `Uploading playlists… ${progress.completed}/${progress.total}`;
  }
  if (progress.phase === "done") {
    return "Finishing…";
  }
  return "Uploading encrypted video…";
}

export async function resolveEncryptedBoardVideoInput(
  agent: Agent,
  source: ProtectedBoardVideoSource | null,
  pdsUrl: string | null,
  onStatus?: (message: string) => void,
) {
  if (!source || !pdsUrl) return undefined;

  onStatus?.("Processing video…");
  const bundle = await prepareEncryptedBoardVideoBundle(source, onStatus);

  return {
    bundle,
    pdsUrl,
    onProgress: (progress: VideoUploadProgress) => {
      onStatus?.(formatEncryptedVideoUploadStatus(progress));
    },
  };
}
