export const MAX_FORUM_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_FORUM_VIDEO_DURATION_SEC = 300;
export const MAX_FORUM_VIDEO_EDGE_PX = 1280;
export const DEFAULT_FORUM_VIDEO_ASPECT_RATIO = 16 / 9;

export type HlsPackagerProgress = {
  phase: "packaging";
  progress: number;
};

/** Even dimensions for H.264, long edge capped at {@link MAX_FORUM_VIDEO_EDGE_PX}. */
export function computePackagedVideoDimensions(
  sourceWidth: number,
  sourceHeight: number,
): { width: number; height: number } {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return { width: 1280, height: 720 };
  }

  const scale =
    Math.max(sourceWidth, sourceHeight) > MAX_FORUM_VIDEO_EDGE_PX
      ? MAX_FORUM_VIDEO_EDGE_PX / Math.max(sourceWidth, sourceHeight)
      : 1;

  const width = Math.max(2, Math.round(sourceWidth * scale));
  const height = Math.max(2, Math.round(sourceHeight * scale));

  return {
    width: width % 2 === 0 ? width : width - 1,
    height: height % 2 === 0 ? height : height - 1,
  };
}

export function getForumVideoAspectRatio(
  video?: { width?: number; height?: number } | null,
): number {
  const { width, height } = video ?? {};
  if (width && height && width > 0 && height > 0) {
    return width / height;
  }
  return DEFAULT_FORUM_VIDEO_ASPECT_RATIO;
}

export function validateForumVideoByteSize(size: number | undefined): void {
  if (size == null) return;
  if (size > MAX_FORUM_VIDEO_BYTES) {
    throw new Error(
      `Video must be ${Math.round(MAX_FORUM_VIDEO_BYTES / (1024 * 1024))} MB or smaller.`,
    );
  }
}

export function validateForumVideoWebFile(file: File): void {
  if (!file.type.startsWith("video/")) {
    throw new Error("Please choose a video file.");
  }
  validateForumVideoByteSize(file.size);
}

export function mimeTypeForHlsPath(path: string): string {
  if (path.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
  if (path.endsWith(".ts")) return "video/mp2t";
  if (path.endsWith(".m4s")) return "video/iso.segment";
  return "application/octet-stream";
}
