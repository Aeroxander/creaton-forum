import type { Agent, ComAtprotoRepoUploadBlob } from "@atproto/api";

import type { CreatonForumVideoAsset } from "../forumTypes";
import {
  buildPdsBlobUrl,
  isHlsPlaylistPath,
  isHlsSegmentPath,
  rewriteM3u8Playlist,
} from "./videoBlobUtils";

export type PackagedHlsFile = {
  path: string;
  bytes: Uint8Array;
  mimeType: string;
};

export type PackagedHlsBundle = {
  files: PackagedHlsFile[];
  masterPath: string;
  duration?: number;
  width?: number;
  height?: number;
};

export type VideoUploadProgress = {
  phase: "uploading-segments" | "uploading-playlists" | "done";
  completed: number;
  total: number;
};

const UPLOAD_CONCURRENCY = 4;

const MIME_BY_PATH: Record<string, string> = {
  ".m3u8": "application/vnd.apple.mpegurl",
  ".ts": "video/mp2t",
  ".m4s": "video/iso.segment",
};

function mimeTypeForPath(path: string, fallback?: string): string {
  if (fallback) return fallback;
  const ext = path.slice(path.lastIndexOf("."));
  return MIME_BY_PATH[ext] ?? "application/octet-stream";
}

function blobFromUpload(data: ComAtprotoRepoUploadBlob.Response["data"]) {
  return data.blob;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) break;
      results[index] = await fn(items[index]!, index);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Upload a packaged HLS bundle to the author's PDS.
 * Playlists are rewritten to use absolute getBlob URLs before upload.
 */
export async function uploadPackagedHlsToPds(
  agent: Agent,
  bundle: PackagedHlsBundle,
  options?: {
    pdsUrl: string;
    onProgress?: (progress: VideoUploadProgress) => void;
  },
): Promise<CreatonForumVideoAsset> {
  const repoAgent = agent as Agent & { did?: string };
  const did = repoAgent.did;
  if (!did) {
    throw new Error("Agent DID is required to upload video.");
  }
  if (!options?.pdsUrl) {
    throw new Error("PDS URL is required to upload video.");
  }

  const segments = bundle.files.filter((file) => isHlsSegmentPath(file.path));
  const playlists = bundle.files.filter((file) => isHlsPlaylistPath(file.path));
  const totalSteps = segments.length + playlists.length;
  let completed = 0;

  const report = (phase: VideoUploadProgress["phase"]) => {
    options?.onProgress?.({ phase, completed, total: totalSteps });
  };

  report("uploading-segments");
  const uploadedSegments = await mapWithConcurrency(segments, UPLOAD_CONCURRENCY, async (file) => {
    const encoding = mimeTypeForPath(file.path, file.mimeType);
    const response = await agent.uploadBlob(file.bytes, { encoding });
    completed += 1;
    report("uploading-segments");
    const cid =
      typeof response.data.blob.ref === "object" && "$link" in response.data.blob.ref
        ? response.data.blob.ref.$link
        : String(response.data.blob.ref);
    return {
      name: file.path.split("/").pop() ?? file.path,
      path: file.path,
      blob: blobFromUpload(response.data),
      url: buildPdsBlobUrl({ did, cid, pdsUrl: options.pdsUrl }),
    };
  });

  const pathToUrl = new Map<string, string>();
  for (const segment of uploadedSegments) {
    pathToUrl.set(segment.path, segment.url);
    const baseName = segment.path.split("/").pop();
    if (baseName) pathToUrl.set(baseName, segment.url);
  }

  const resolveUri = (relativeUri: string) => {
    if (relativeUri.startsWith("http://") || relativeUri.startsWith("https://")) {
      return relativeUri;
    }
    const normalized = relativeUri.split("/").pop() ?? relativeUri;
    const fromPath = pathToUrl.get(relativeUri) ?? pathToUrl.get(normalized);
    if (!fromPath) {
      throw new Error(`Missing uploaded file for HLS reference: ${relativeUri}`);
    }
    return fromPath;
  };

  report("uploading-playlists");
  const sortedPlaylists = [...playlists].sort((a, b) => {
    if (a.path === bundle.masterPath) return 1;
    if (b.path === bundle.masterPath) return -1;
    return a.path.localeCompare(b.path);
  });

  const playlistUploads = [];
  for (const file of sortedPlaylists) {
    const text = new TextDecoder().decode(file.bytes);
    const rewritten = rewriteM3u8Playlist(text, resolveUri);
    const bytes = new TextEncoder().encode(rewritten);
    const encoding = mimeTypeForPath(file.path, file.mimeType);
    const response = await agent.uploadBlob(bytes, { encoding });
    completed += 1;
    report("uploading-playlists");
    const cid =
      typeof response.data.blob.ref === "object" && "$link" in response.data.blob.ref
        ? response.data.blob.ref.$link
        : String(response.data.blob.ref);
    const upload = {
      path: file.path,
      blob: blobFromUpload(response.data),
      url: buildPdsBlobUrl({ did, cid, pdsUrl: options.pdsUrl }),
    };
    playlistUploads.push(upload);
    pathToUrl.set(upload.path, upload.url);
    const baseName = upload.path.split("/").pop();
    if (baseName) pathToUrl.set(baseName, upload.url);
  }

  const master =
    playlistUploads.find((item) => item.path === bundle.masterPath) ??
    playlistUploads.find((item) => item.path.endsWith("master.m3u8")) ??
    playlistUploads[0];

  if (!master) {
    throw new Error("HLS master playlist was not produced.");
  }

  options?.onProgress?.({ phase: "done", completed: totalSteps, total: totalSteps });

  return {
    version: 1,
    playlist: master.blob,
    segments: uploadedSegments.map(({ name, blob }) => ({ name, blob })),
    duration: bundle.duration,
    width: bundle.width,
    height: bundle.height,
  };
}
