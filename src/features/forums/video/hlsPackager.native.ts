import type { DocumentPickerAsset } from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import { execute, FFmpegError } from "ffmpeg-expo";

import type { PackagedHlsBundle, PackagedHlsFile } from "@creaton/forum-core";

import {
  MAX_FORUM_VIDEO_DURATION_SEC,
  mimeTypeForHlsPath,
  validateForumVideoByteSize,
  type HlsPackagerProgress,
} from "./forumVideoLimits";
import { packagedDimensionsFromProbe, probeVideoMetadata } from "./probeVideoMetadata.native";

export type { HlsPackagerProgress };

async function collectPackagedFiles(
  directory: Directory,
  prefix = "",
): Promise<PackagedHlsFile[]> {
  const files: PackagedHlsFile[] = [];

  for (const entry of directory.list()) {
    if (entry instanceof Directory) {
      const nestedPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
      files.push(...(await collectPackagedFiles(entry, nestedPrefix)));
      continue;
    }

    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    files.push({
      path,
      bytes: new Uint8Array(await entry.arrayBuffer()),
      mimeType: mimeTypeForHlsPath(path),
    });
  }

  return files;
}

function packagingProgress(
  onProgress: ((progress: HlsPackagerProgress) => void) | undefined,
  timeMs: number,
  totalDurationMs?: number,
) {
  if (!onProgress) return;
  const ratio =
    totalDurationMs && totalDurationMs > 0
      ? Math.min(timeMs / totalDurationMs, 0.99)
      : Math.min(timeMs / (MAX_FORUM_VIDEO_DURATION_SEC * 1000), 0.99);
  onProgress({ phase: "packaging", progress: ratio });
}

/**
 * Transcode and segment a picked video into HLS using on-device FFmpeg (native).
 */
export async function packageVideoAsHls(
  asset: DocumentPickerAsset,
  onProgress?: (progress: HlsPackagerProgress) => void,
): Promise<PackagedHlsBundle> {
  validateForumVideoByteSize(asset.size);
  if (!asset.uri) {
    throw new Error("Please choose a video file.");
  }

  const jobId = `${Date.now()}`;
  const outputDir = new Directory(Paths.cache, "forum-hls", jobId);
  outputDir.create({ intermediates: true, idempotent: true });

  const masterFile = new File(outputDir, "master.m3u8");
  const segmentPattern = `${outputDir.uri}/seg_%03d.ts`;

  const probe = await probeVideoMetadata(asset.uri);
  const { width, height } = packagedDimensionsFromProbe(probe);

  try {
    const result = await execute(
      [
        "-i",
        asset.uri,
        "-t",
        String(MAX_FORUM_VIDEO_DURATION_SEC),
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "23",
        "-vf",
        `scale=${width}:${height}`,
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-f",
        "hls",
        "-hls_time",
        "6",
        "-hls_playlist_type",
        "vod",
        "-hls_segment_filename",
        segmentPattern,
        "-y",
        masterFile.uri,
      ],
      {
        onProgress: (progress) => {
          packagingProgress(onProgress, progress.time, progress.totalDuration);
        },
      },
    );

    if (result.returnCode !== 0) {
      throw new FFmpegError("Video packaging failed.", result.returnCode, result.output);
    }

    const files = await collectPackagedFiles(outputDir);
    if (!files.length) {
      throw new Error("Video packaging did not produce any output files.");
    }

    const masterPath =
      files.find((item) => item.path === "master.m3u8")?.path ??
      files.find((item) => item.path.endsWith(".m3u8"))?.path ??
      "master.m3u8";

    return {
      files,
      masterPath,
      width,
      height,
      duration: probe.durationSec,
    };
  } finally {
    if (outputDir.exists) {
      outputDir.delete();
    }
  }
}
