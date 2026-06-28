import type { Agent } from "@atproto/api";

import {
  encryptPackagedHlsForForum,
  wrapForumVideoKey,
} from "../crypto/forumVideoCrypto";
import type { CreatonForumVideoAsset } from "../forumTypes";
import {
  uploadPackagedHlsToPds,
  type PackagedHlsBundle,
  type VideoUploadProgress,
} from "./pdsVideoUpload";

export type EncryptedForumVideoUploadInput = {
  bundle: PackagedHlsBundle;
  pdsUrl: string;
  boardEpochKey: Uint8Array;
  keyEpochUri: string;
  epoch: string;
  onProgress?: (progress: VideoUploadProgress) => void;
};

/** Encrypt an HLS bundle, upload ciphertext to the PDS, and wrap the AES key for a protected board. */
export async function uploadEncryptedForumVideoToPds(
  agent: Agent,
  input: EncryptedForumVideoUploadInput,
): Promise<CreatonForumVideoAsset> {
  const { bundle: encryptedBundle, key, iv } = await encryptPackagedHlsForForum(input.bundle);
  const video = await uploadPackagedHlsToPds(agent, encryptedBundle, {
    pdsUrl: input.pdsUrl,
    onProgress: input.onProgress,
  });
  video.encryption = await wrapForumVideoKey({
    key,
    iv,
    boardEpochKey: input.boardEpochKey,
    keyEpochUri: input.keyEpochUri,
    epoch: input.epoch,
  });
  return video;
}
