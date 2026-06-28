import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  HlsOutputFormat,
  Input,
  MpegTsOutputFormat,
  Output,
  PathedTarget,
} from "mediabunny";

import type { PackagedHlsBundle, PackagedHlsFile } from "@creaton/forum-core";

import {
  MAX_FORUM_VIDEO_DURATION_SEC,
  computePackagedVideoDimensions,
  mimeTypeForHlsPath,
  validateForumVideoWebFile,
  type HlsPackagerProgress,
} from "./forumVideoLimits";

export type { HlsPackagerProgress };

/**
 * Transcode and segment a video file into an HLS bundle using Mediabunny (web).
 */
export async function packageVideoAsHls(
  file: File,
  onProgress?: (progress: HlsPackagerProgress) => void,
): Promise<PackagedHlsBundle> {
  validateForumVideoWebFile(file);

  const writtenFiles = new Map<string, ArrayBuffer>();

  const output = new Output({
    format: new HlsOutputFormat({
      segmentFormat: new MpegTsOutputFormat(),
      targetDuration: 6,
    }),
    target: new PathedTarget("master.m3u8", ({ path }) =>
      new BufferTarget({
        onFinalize: (buffer) => {
          writtenFiles.set(path, buffer);
        },
      }),
    ),
  });

  const input = new Input({
    source: new BlobSource(file),
    formats: ALL_FORMATS,
  });

  const duration = await input.computeDuration();
  if (Number.isFinite(duration) && duration > MAX_FORUM_VIDEO_DURATION_SEC) {
    throw new Error(
      `Video must be ${MAX_FORUM_VIDEO_DURATION_SEC / 60} minutes or shorter.`,
    );
  }

  const videoTrack = (await input.getVideoTracks())[0];
  const sourceWidth = videoTrack?.displayWidth;
  const sourceHeight = videoTrack?.displayHeight;
  const packagedDimensions =
    sourceWidth && sourceHeight
      ? computePackagedVideoDimensions(sourceWidth, sourceHeight)
      : undefined;

  const conversion = await Conversion.init({
    input,
    output,
    video: {
      codec: "avc",
      width: packagedDimensions?.width ?? 1280,
      height: packagedDimensions?.height,
      fit: "contain",
    },
    audio: {
      codec: "aac",
    },
    trim: Number.isFinite(duration)
      ? { end: Math.min(duration, MAX_FORUM_VIDEO_DURATION_SEC) }
      : undefined,
  });

  conversion.onProgress = (value) => {
    onProgress?.({ phase: "packaging", progress: value });
  };

  await conversion.execute();

  if (!writtenFiles.size) {
    throw new Error("Video packaging did not produce any output files.");
  }

  const files: PackagedHlsFile[] = [...writtenFiles.entries()].map(([path, buffer]) => ({
    path,
    bytes: new Uint8Array(buffer),
    mimeType: mimeTypeForHlsPath(path),
  }));

  const masterPath =
    files.find((item) => item.path === "master.m3u8")?.path ??
    files.find((item) => item.path.endsWith(".m3u8"))?.path ??
    "master.m3u8";

  return {
    files,
    masterPath,
    duration: Number.isFinite(duration) ? duration : undefined,
    width: packagedDimensions?.width ?? sourceWidth,
    height: packagedDimensions?.height ?? sourceHeight,
  };
}
